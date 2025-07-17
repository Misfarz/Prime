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

    // -------- Real-time stock validation --------
    const outOfStockItems = [];
    for (const item of cart.items) {
      const product = item.product;
      if (!product) continue;
      const sizeObj = product.sizes?.find(s => s.size === item.size);
      if (!sizeObj || sizeObj.quantity < item.quantity) {
        outOfStockItems.push({ productName: product.productName, size: item.size });
      }
    }
    if (outOfStockItems.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Some items went out of stock. Please review your cart.',
        outOfStockItems,
      });
    }
    // -------------------------------------------

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

      // Re-use any existing pending Razorpay order for this user to prevent duplicates
      let order = await Order.findOne({ user: userId, paymentMethod: 'razorpay', paymentStatus: 'Pending', orderStatus: 'payment pending' });
      if (order) {
        // Refresh the order details (items/amount) in case cart changed
        order.items = orderItems;
        order.subtotal = subtotal;
        order.shipping = shipping;
        order.tax = tax;
        order.discount = couponDiscount;
        order.total = finalAmount;
        await order.save();
      } else {
        // Create new order document with initial status
        order = new Order({
        user: userId,
        items: orderItems,
        shippingAddress: selectedAddressDoc,
        paymentMethod: 'razorpay',
        paymentStatus: 'Pending',
        orderStatus: 'payment pending',
        subtotal,
        shipping,
        tax,
        discount: couponDiscount,
        couponCode: cart.coupon?.code || '',
        total: finalAmount,
      });
      await order.save();
    }

    // Store order ID in session for verification
    req.session.pendingRazorpayOrder = order._id;
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
      }
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

    // Handle fresh checkout payment
    if (req.session.pendingRazorpayOrder && req.session.rzpOrderId === razorpay_order_id) {
      const orderId = req.session.pendingRazorpayOrder;
      const order = await Order.findById(orderId);
      
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

      try {
        // Verify the payment
        const isValid = verifyPaymentSignature({ order_id: razorpay_order_id, payment_id: razorpay_payment_id, signature: razorpay_signature });
        if (!isValid) {
          // If verification fails, mark order as Failed
          order.paymentStatus = 'Failed';
          order.paymentDetails = { razorpay_payment_id, razorpay_order_id, razorpay_signature };
          order.orderStatus = 'Cancelled';
          await order.save();
          return res.status(400).json({ success: false, message: 'Payment verification failed', orderId: order._id });
        }

        // If verification succeeds, update to Paid and Placed
        order.paymentStatus = 'Paid';
        order.orderStatus = 'Placed';
        order.paymentDetails = { razorpay_payment_id, razorpay_order_id, razorpay_signature };
        await order.save();

        // Stock adjustment and cart clearing
        await Promise.all([
          ...order.items.map((it) => Product.findByIdAndUpdate(it.product, { $inc: { 'sizes.$[elem].quantity': -it.quantity } }, { arrayFilters: [{ 'elem.size': it.size }] })),
          Cart.deleteOne({ user: order.user }),
        ]);

        delete req.session.pendingRazorpayOrder;
        delete req.session.rzpOrderId;

        return res.json({ success: true, orderId: order._id });
      } catch (error) {
        console.error('Payment verification error:', error);
        // If any error occurs, mark order as Failed
        order.paymentStatus = 'Failed';
        order.orderStatus = 'Payment Failed';
        order.paymentDetails = { razorpay_payment_id, razorpay_order_id, razorpay_signature, error: error.message };
        await order.save();
        return res.status(500).json({ success: false, message: 'Payment processing failed', orderId: order._id });
      }
    }
    // Handle retry payment
    else if (req.session.retryOrderId && req.session.retryRzpOrderId === razorpay_order_id) {
      const order = await Order.findById(req.session.retryOrderId);
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

      try {
        // Verify the payment
        const isValid = verifyPaymentSignature({ order_id: razorpay_order_id, payment_id: razorpay_payment_id, signature: razorpay_signature });
        if (!isValid) {
          // If verification fails, keep as Failed
          order.paymentStatus = 'Failed';
          order.paymentDetails = { razorpay_payment_id, razorpay_order_id, razorpay_signature };
          await order.save();
          return res.status(400).json({ success: false, message: 'Payment verification failed', orderId: order._id });
        }

        // If verification succeeds, update to Paid and Placed
        order.paymentStatus = 'Paid';
        order.orderStatus = 'Placed';
        order.paymentDetails = { razorpay_payment_id, razorpay_order_id, razorpay_signature };

        // Adjust product stock for each item and clear user's cart (same as fresh payment success)
        await Promise.all([
          ...order.items.map((it) =>
            Product.findByIdAndUpdate(
              it.product,
              { $inc: { 'sizes.$[elem].quantity': -it.quantity } },
              { arrayFilters: [{ 'elem.size': it.size }] }
            )
          ),
          Cart.deleteOne({ user: order.user }),
        ]);

        await order.save();

        delete req.session.retryOrderId;
        delete req.session.retryRzpOrderId;

        return res.json({ success: true, orderId: order._id });
      } catch (error) {
        console.error('Retry payment verification error:', error);
        // If any error occurs, mark order as Failed
        order.paymentStatus = 'Failed';
        order.paymentDetails = { razorpay_payment_id, razorpay_order_id, razorpay_signature, error: error.message };
        await order.save();
        return res.status(500).json({ success: false, message: 'Payment processing failed', orderId: order._id });
      }
    } else {
      return res.status(404).json({ success: false, message: 'Order session expired' });
    }
  } catch (err) {
    console.error('verifyPayment error:', err);
    return res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
}

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
