const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const { createRazorpayOrder, verifyPaymentSignature } = require('../../utils/razorpay');
const mongoose = require('mongoose');

/**
 * Helper to increment coupon usage count safely
 */
async function incrementCouponUsage(couponId) {
  if (!couponId) return;
  await Coupon.findByIdAndUpdate(couponId, {
    $inc: { usageCount: 1 },
  });
}


function calculateCart(cartItems) {
  return cartItems.reduce(
    (acc, item) => {
      const product = item.product;
      if (!product) return acc;
      const quantity = item.quantity;
      const itemBasePrice = product.salePrice && product.salePrice < product.regularPrice ? product.salePrice : product.regularPrice;
      const brandOffer = product.category?.categoryOffer || 0;
      const productOffer = product.productOffer || 0;
      const effectiveDiscount = Math.max(brandOffer, productOffer);
      const effectivePrice = Math.round(itemBasePrice * (1 - effectiveDiscount / 100));
      const itemTotal = effectivePrice * quantity;
      acc.subtotal += itemTotal;
      acc.discountAmount += (itemBasePrice - effectivePrice) * quantity;
      return acc;
    },
    { subtotal: 0, discountAmount: 0 }
  );
}

const proceedPayment = async (req, res, next) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');


    if (req.body.addressId) {
      req.session.selectedAddressId = req.body.addressId;
    }

  
    const cart = await Cart.findOne({ user: userId }).populate({
      path: 'items.product',
      populate: { path: 'category' },
    });
    if (!cart || cart.items.length === 0) {
      return res.redirect('/cart?error=Cart is empty');
    }

    const { subtotal, discountAmount } = calculateCart(cart.items);

   
    const shipping = 50;
    const tax = Math.round(subtotal * 0.05);
    const couponDiscount = cart.coupon?.discount || 0;
    const total = subtotal + shipping + tax - couponDiscount;

    const summary = { subtotal, shipping, tax, couponDiscount, total };

    return res.render('payment', {
      user,
      summary,
    });
  } catch (err) {
    console.error('Error in proceedPayment:', err);
    next(err);
  }
};

const choosePayment = async (req, res) => {
  try {
    const userId = req.session.user?._id || req.session.user;
    const paymentMethod = req.body.payment;
    if (!userId) return res.status(401).json({ success: false, message: 'Please login to continue' });
    if (!['cod', 'razorpay', 'wallet'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    const user = await User.findById(userId);
    const cart = await Cart.findOne({ user: userId }).populate({
      path: 'items.product',
      populate: { path: 'category' },
    });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const { subtotal, discountAmount } = calculateCart(cart.items);
    const shipping = 50;
    const tax = Math.round(subtotal * 0.05);
    const couponDiscount = cart.coupon?.discount || 0;
    const finalAmount = subtotal + shipping + tax - couponDiscount;

    // Select address
    let selectedAddressDoc;
    if (req.session.selectedAddressId) {
      selectedAddressDoc = await Address.findOne({ _id: req.session.selectedAddressId, userId });
    }
    if (!selectedAddressDoc) {
      // fallback to first address
      const addressDocs = await Address.findOne({ userId });
      selectedAddressDoc = addressDocs?.address?.[0];
    }
    if (!selectedAddressDoc) {
      return res.status(400).json({ success: false, message: 'No shipping address found' });
    }

    // Prepare order items
    const orderItems = cart.items.map((item) => {
      const product = item.product;
      const quantity = item.quantity;
      const itemBasePrice = product.salePrice && product.salePrice < product.regularPrice ? product.salePrice : product.regularPrice;
      const brandOffer = product.category?.categoryOffer || 0;
      const productOffer = product.productOffer || 0;
      const effectiveDiscount = Math.max(brandOffer, productOffer);
      const effectivePrice = Math.round(itemBasePrice * (1 - effectiveDiscount / 100));
      return {
        product: product._id,
        quantity,
        size: item.size,
        price: effectivePrice,
        total: effectivePrice * quantity,
        discount: effectiveDiscount,
      };
    });

    if (paymentMethod === 'cod') {
      const order = new Order({
        user: userId,
        items: orderItems,
        shippingAddress: selectedAddressDoc,
        paymentMethod: 'cod',
        paymentStatus: 'Pending',
        orderStatus: 'Placed',
        subtotal,
        shipping,
        tax,
        discount: couponDiscount,
        couponCode: cart.coupon?.code || '',
        total: finalAmount,
      });
      await order.save();

      // adjust stock and clear cart
      await Promise.all([
        ...orderItems.map((it) => Product.findByIdAndUpdate(it.product, { $inc: { 'sizes.$[elem].quantity': -it.quantity } }, { arrayFilters: [{ 'elem.size': it.size }] })),
        Cart.deleteOne({ user: userId }),
      ]);

      if (cart.coupon?.couponId) await incrementCouponUsage(cart.coupon.couponId);

      return res.json({ success: true, redirect: `/order-success/${order._id}` });
    }

    if (paymentMethod === 'wallet') {
      if (user.wallet < finalAmount) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }
      user.wallet -= finalAmount;
      await user.save();
      await WalletTransaction.create({
        user: userId,
        amount: finalAmount,
        type: 'debit',
        description: 'Order payment',
      });

      const order = new Order({
        user: userId,
        items: orderItems,
        shippingAddress: selectedAddressDoc,
        paymentMethod: 'wallet',
        paymentStatus: 'Paid',
        orderStatus: 'Placed',
        subtotal,
        shipping,
        tax,
        discount: couponDiscount,
        couponCode: cart.coupon?.code || '',
        total: finalAmount,
      });
      await order.save();
      await Promise.all([
        ...orderItems.map((it) => Product.findByIdAndUpdate(it.product, { $inc: { 'sizes.$[elem].quantity': -it.quantity } }, { arrayFilters: [{ 'elem.size': it.size }] })),
        Cart.deleteOne({ user: userId }),
      ]);

      if (cart.coupon?.couponId) await incrementCouponUsage(cart.coupon.couponId);

      return res.json({ success: true, redirect: `/order-success/${order._id}` });
    }

    // Razorpay initialization
    if (paymentMethod === 'razorpay') {
      const receiptId = `rcpt_${Date.now()}`;
      const rzpOrder = await createRazorpayOrder({ amount: Math.round(finalAmount * 100), currency: 'INR', receipt: receiptId, notes: { userId } });

      // Temporarily store order data in session
      req.session.pendingRazorpayOrder = {
        user: userId,
        items: orderItems,
        shippingAddress: selectedAddressDoc,
        paymentMethod: 'razorpay',
        paymentStatus: 'Pending',
        orderStatus: 'Placed',
        subtotal,
        shipping,
        tax,
        discount: couponDiscount,
        couponCode: cart.coupon?.code || '',
        total: finalAmount,
      };
      req.session.rzpOrderId = rzpOrder.id;

      return res.json({
        success: true,
        razorpay: {
          key: process.env.RAZORPAY_KEY_ID,
          order_id: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          name: 'Prime',
          description: 'Order Payment',
          prefill: {
            name: user.name,
            email: user.email,
            contact: user.phone || '',
          },
        },
      });
    }
  } catch (err) {
    console.error('choosePayment error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment details' });
    }

    const isValid = verifyPaymentSignature({ order_id: razorpay_order_id, payment_id: razorpay_payment_id, signature: razorpay_signature });
    if (!isValid) return res.status(400).json({ success: false, message: 'Invalid signature' });

    if (!req.session.pendingRazorpayOrder || req.session.rzpOrderId !== razorpay_order_id) {
      return res.status(404).json({ success: false, message: 'Order session expired' });
    }

    const orderData = req.session.pendingRazorpayOrder;
    orderData.paymentStatus = 'Paid';
    orderData.paymentDetails = { razorpay_payment_id, razorpay_order_id, razorpay_signature };

    const order = new Order(orderData);
    await order.save();

    // adjust stock & clear cart
    await Promise.all([
      ...order.items.map((it) => Product.findByIdAndUpdate(it.product, { $inc: { 'sizes.$[elem].quantity': -it.quantity } }, { arrayFilters: [{ 'elem.size': it.size }] })),
      Cart.deleteOne({ user: order.user }),
    ]);

    // cleanup session
    delete req.session.pendingRazorpayOrder;
    delete req.session.rzpOrderId;

    return res.json({ success: true, orderId: order._id });
  } catch (err) {
    console.error('verifyPayment error:', err);
    return res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
};

const paymentFailure = async (req, res) => {
  const errorMessage = req.query.error || 'Payment failed';
  res.render('payment-error', { errorMessage });
};

module.exports = {
  proceedPayment,
  choosePayment,
  verifyRazorpayPayment,
  paymentFailure,
};
