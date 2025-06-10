const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const { sendWalletNotification } = require('../../utils/walletNotifier');
const Razorpay = require('razorpay');
const crypto = require('crypto');

 
const razorpay = new Razorpay({
    key_id: process.env.Razorpay_key_id,
    key_secret: process.env.Razorpay_key_secret
});

const loadCheckout = async (req, res, next) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const userId = req.session.user._id;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.redirect('/login');
        }

       
        const addresses = await Address.find({ userId: userId }).sort({ isDefault: -1, createdAt: -1 });

       
        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        });

        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart?error=Cart is empty');
        }

        
        let subtotal = 0;
        
        const cartItems = cart.items.map(item => {
            const product = item.product;
            
            let appliedOffer = 0;
            let offerType = null;
            
        
            if (product.productOffer && product.productOffer > 0) {
                appliedOffer = product.productOffer;
                offerType = 'product';
            }
            
            
            if (product.category && product.category.categoryOffer && product.category.categoryOffer > 0) {
                
                if (product.category.categoryOffer > appliedOffer) {
                    appliedOffer = product.category.categoryOffer;
                    offerType = 'category';
                }
            }
            
      
            let itemPrice;
            if (appliedOffer > 0) {
             
                const basePrice = product.salePrice && product.salePrice < product.regularPrice ? product.salePrice : product.regularPrice;
                itemPrice = Math.round(basePrice * (1 - appliedOffer/100));
            } else if (product.salePrice && product.salePrice < product.regularPrice) {
                itemPrice = product.salePrice;
            } else {
                itemPrice = product.regularPrice;
            }
            
            const itemTotal = itemPrice * item.quantity;
            subtotal += itemTotal;
            
            return {
                ...item.toObject(),
                itemPrice,
                itemTotal,
                appliedOffer,
                offerType
            };
        });

       
        const shipping = 50;
        const tax = Math.round(subtotal * 0.05);
        
      
        let couponDiscount = 0;
        let couponCode = '';
        
        if (cart.coupon && cart.coupon.discount) {
            couponDiscount = cart.coupon.discount;
            couponCode = cart.coupon.code;
        }
        
        const total = subtotal + shipping + tax - couponDiscount;
        
     
        const currentDate = new Date();
        let availableCoupons = [];
        
        try {
           
            availableCoupons = await Coupon.find({
                isList: true,
                expireOn: { $gt: currentDate }
            }).sort({ offerPrice: -1 });
            

            
            
            // Filter available coupons that are valid for this user
            availableCoupons = availableCoupons.filter(coupon => {
                // Check if coupon is not expired
                const notExpired = new Date(coupon.expireOn) > currentDate;
                
                // Check if coupon has available uses left
                const hasAvailableUses = coupon.usageLimit === 0 || coupon.usageCount < coupon.usageLimit;
                
                // Check if user has not used this coupon before - this is the key validation
                // that ensures a coupon can only be used once per user
                const userHasNotUsed = !coupon.userId || !Array.isArray(coupon.userId) || !coupon.userId.includes(userId);
                
                return notExpired && hasAvailableUses && userHasNotUsed;
            });
            
       
        } catch (err) {
            console.error('Error fetching available coupons:', err);
           
            availableCoupons = []; 
        }
      
        res.render('checkout', {
            user,
            addresses,
            cart: {
                items: cartItems,
                coupon: cart.coupon
            },
            summary: {
                subtotal,
                shipping,
                tax,
                couponDiscount,
                couponCode,
                total,
                walletBalance: user.wallet || 0
            },
            availableCoupons
        });
    } catch (error) {
        console.error('Error loading checkout', error);
        res.status(500).render('error', { 
            error: 'Failed to load checkout page',
            user: req.session.user
        });
    }
};



const placeOrder = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }


        console.log('Request body:', req.body);
        console.log('Request headers:', req.headers);
        console.log('Content-Type:', req.headers['content-type']);
        console.log('Payment Method (raw):', req.body?.paymentMethod);
        console.log('Payment Method (type):', typeof req.body?.paymentMethod);
        
        
        const userId = req.session.user._id;
        let addressId, paymentMethod, razorpayPaymentId, razorpayOrderId, razorpaySignature;
        
       
        if (!req.body) {
          
            if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
                return res.status(400).json({
                    success: false,
                    message: 'Unable to process form data. Please try again.'
                });
            }
        } else {
            
            addressId = req.body.addressId;
            paymentMethod = req.body.paymentMethod;
            razorpayPaymentId = req.body.razorpayPaymentId;
            razorpayOrderId = req.body.razorpayOrderId;
            razorpaySignature = req.body.razorpaySignature;
        }
        
        console.log('Payment method:', paymentMethod);
        console.log('Address ID:', addressId);

        if (!addressId || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'Address and payment method are required'
            });
        }

       
        const paymentMethodLower = paymentMethod.toLowerCase();
        console.log('Payment method (lowercase):', paymentMethodLower);
        
  
        if ((paymentMethodLower === 'razorpay') && !razorpayPaymentId) {
            const user = await User.findById(userId);
            const cart = await Cart.findOne({ user: userId }).populate({
                path: 'items.product',
                populate: {
                    path: 'category'
                }
            });

            if (!cart || cart.items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cart is empty'
                });
            }

            const selectedAddress = await Address.findOne({ _id: addressId, userId: userId });
            if (!selectedAddress) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid address selected'
                });
            }
            
           
            let subtotal = 0;
            cart.items.forEach(item => {
                const product = item.product;
                let itemPrice;
                
             
                let appliedOffer = 0;
                
                if (product.productOffer && product.productOffer > 0) {
                    appliedOffer = product.productOffer;
                }
                
                if (product.category && product.category.categoryOffer && product.category.categoryOffer > 0) {
                    if (product.category.categoryOffer > appliedOffer) {
                        appliedOffer = product.category.categoryOffer;
                    }
                }
                
                if (appliedOffer > 0) {
                    const basePrice = product.salePrice && product.salePrice < product.regularPrice ? product.salePrice : product.regularPrice;
                    itemPrice = Math.round(basePrice * (1 - appliedOffer/100));
                } else if (product.salePrice && product.salePrice < product.regularPrice) {
                    itemPrice = product.salePrice;
                } else {
                    itemPrice = product.regularPrice;
                }
                
                subtotal += itemPrice * item.quantity;
            });
            
            const shipping = 50;
            const tax = Math.round(subtotal * 0.05);
            let couponDiscount = 0;
            
            if (cart.coupon && cart.coupon.discount) {
                couponDiscount = cart.coupon.discount;
            }
            
            const total = subtotal + shipping + tax - couponDiscount;
            
        
            const options = {
                amount: total * 100, 
                currency: 'INR',
                receipt: 'order_' + Date.now(),
                payment_capture: 1 
            };
            
            try {
                const razorpayOrder = await razorpay.orders.create(options);
                
               
                return res.status(200).json({
                    success: true,
                    razorpayOrderId: razorpayOrder.id,
                    amount: total,
                    key_id: process.env.Razorpay_key_id,
                    prefill: {
                        name: user.firstName + ' ' + (user.lastName || ''),
                        email: user.email,
                        contact: selectedAddress.phone
                    },
                    notes: {
                        addressId: addressId,
                        userId: userId
                    }
                });
            } catch (error) {
                console.error('Error creating Razorpay order:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to create payment order'
                });
            }
        }
        
        // If we have Razorpay payment details, verify the payment
        if (paymentMethodLower === 'razorpay' && razorpayPaymentId && razorpayOrderId && razorpaySignature) {
          
           
            const generated_signature = crypto
                .createHmac('sha256', process.env.Razorpay_key_secret)
                .update(razorpayOrderId + '|' + razorpayPaymentId)
                .digest('hex');
                
            if (generated_signature !== razorpaySignature) {
                return res.status(400).json({
                    success: false,
                    message: 'Payment verification failed'
                });
            }
          
        }
        
      
        const user = await User.findById(userId);
        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        const selectedAddress = await Address.findOne({ _id: addressId, userId: userId });
        if (!selectedAddress) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address selected'
            });
        }
        
     
        let subtotal = 0;
        
        const orderItems = cart.items.map(item => {
            const product = item.product;
            
            let appliedOffer = 0;
            let offerType = null;
     
            if (product.productOffer && product.productOffer > 0) {
                appliedOffer = product.productOffer;
                offerType = 'product';
            }
            
       
            if (product.category && product.category.categoryOffer && product.category.categoryOffer > 0) {
         
                if (product.category.categoryOffer > appliedOffer) {
                    appliedOffer = product.category.categoryOffer;
                    offerType = 'category';
                }
            }
            
          
            let itemPrice;
            if (appliedOffer > 0) {
          
                const basePrice = product.salePrice && product.salePrice < product.regularPrice ? product.salePrice : product.regularPrice;
                itemPrice = Math.round(basePrice * (1 - appliedOffer/100));
            } else if (product.salePrice && product.salePrice < product.regularPrice) {
                itemPrice = product.salePrice;
            } else {
                itemPrice = product.regularPrice;
            }
            
            const itemTotal = itemPrice * item.quantity;
            subtotal += itemTotal;
            
            return {
                product: item.product._id,
                quantity: item.quantity,
                size: item.size,
                price: itemPrice,
                total: itemTotal
            };
        });

        const shipping = 50; 
        const tax = Math.round(subtotal * 0.05);
        
      
        let couponDiscount = 0;
        let couponCode = '';
        let couponId = null;
        
        if (cart.coupon && cart.coupon.discount) {
            couponDiscount = cart.coupon.discount;
            couponCode = cart.coupon.code;
            couponId = cart.coupon.couponId;
        }
        
        const total = subtotal + shipping + tax - couponDiscount;

        let walletTransaction;
        if (paymentMethodLower === 'wallet') {
          
            if (user.wallet < total) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance'
                });
            }
            
         
            user.wallet -= total;
            await user.save();
            
        
            walletTransaction = new WalletTransaction({
                user: userId,
                amount: total,
                type: 'debit',
                description: 'Payment for order',
                date: new Date()
            });
            
      
      
        }
        
        const newOrder = new Order({
            user: userId,
            items: orderItems,
            shippingAddress: {
                fullName: selectedAddress.fullName,
                addressLine1: selectedAddress.addressLine1,
                addressLine2: selectedAddress.addressLine2 || '',
                city: selectedAddress.city,
                state: selectedAddress.state,
                postalCode: selectedAddress.postalCode,
                country: selectedAddress.country,
                phone: selectedAddress.phone
            },
            paymentMethod,
            paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
            orderStatus: 'Placed',
            subtotal,
            shipping,
            tax,
            discount: couponDiscount,
            couponCode: couponCode,
            total
        });

        const savedOrder = await newOrder.save();

        
        if (paymentMethodLower === 'wallet' && walletTransaction) {
            try {
                walletTransaction.orderId = savedOrder._id;
                walletTransaction.description = `Payment for order #${savedOrder.orderNumber}`;
                const savedTransaction = await walletTransaction.save();
                console.log('Saved wallet transaction:', savedTransaction);
                
              
                await sendWalletNotification(
                    userId,
                    'debit',
                    total,
                    `Payment for order #${savedOrder.orderNumber}`
                );
            } catch (error) {
                console.error('Error saving wallet transaction:', error);
                
            }
        }
        
   
        user.orderHistory.push(savedOrder._id);
        await user.save();
        
 
     
        if (cart.coupon && cart.coupon.couponId) {
            const coupon = await Coupon.findById(cart.coupon.couponId);
            if (coupon) {
                // Ensure user ID is in the coupon's userId array
                if (!coupon.userId.includes(userId)) {
                    coupon.userId.push(userId);
                   
                    coupon.usageCount += 1;
                }
              
                await coupon.save();
                console.log(`Permanently recorded coupon usage for user ${userId} and coupon ${coupon.name}. Usage count: ${coupon.usageCount}`);
            }
        }
        
       
        await Cart.findOneAndUpdate(
            { user: userId },
            { $set: { items: [], totalAmount: 0 }, $unset: { coupon: 1 } }
        );

        
        for (const item of cart.items) {
            
        
            
            try {
              
                const productId = typeof item.product === 'object' ? item.product._id : item.product;
                const size = item.size;
                
              
                const product = await Product.findById(productId);
                
                if (!product) {
                    console.error(`Product not found: ${productId}`);
                    continue;
                }
                
               
                const sizeIndex = product.sizes.findIndex(s => s.size === size);
                
                if (sizeIndex !== -1) {
                    
                    product.sizes[sizeIndex].quantity = Math.max(0, product.sizes[sizeIndex].quantity - item.quantity);
                    
                    
                    const allSizesOutOfStock = product.sizes.every(s => s.quantity <= 0);
                    
                    
                    if (allSizesOutOfStock) {
                        product.status = 'Out of stock';
                    }
                    
                    
                    await product.save();
                    
                    console.log(`Updated stock for ${product.productName}, size ${size}: ${product.sizes[sizeIndex].quantity}`);
                } else {
                    console.error(`Size ${size} not found for product ${product.productName}`);
                }
            } catch (error) {
                console.error(`Error updating stock for product ${item.product}:`, error);
            }
        }

        
       
        const expectsRedirect = req.headers['content-type'] === 'application/x-www-form-urlencoded' && 
                               !req.xhr && 
                               !req.headers['x-requested-with'];
        
      
        if (expectsRedirect && ((paymentMethodLower === 'razorpay' && razorpayPaymentId) || paymentMethodLower === 'cod' || paymentMethodLower === 'wallet')) {
            return res.redirect(`/order-success/${savedOrder._id}`);
        }
        
        
        return res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            orderId: savedOrder._id,
            redirectUrl: `/order-success/${savedOrder._id}`
        });
    } catch (error) {
        console.error('Error placing order:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to place order'
        });
    }
};

const orderSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        if (!req.session.user) {
            return res.redirect('/login');
        }

       
        const order = await Order.findById(orderId).populate({
            path: 'items.product',
            select: 'productName productImage regularPrice salePrice'
        });

        if (!order || order.user.toString() !== req.session.user._id) {
            return res.redirect('/profile?tab=orders');
        }

        
        const user = await User.findById(req.session.user._id);

        res.render('order-success', {
            user: req.session.user,
            order,
            userName: user.firstName || 'Valued Customer',
            orderDate: order.createdAt.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            orderStatus: order.orderStatus
        });
    } catch (error) {
        console.error('Error loading order success page:', error);
        res.status(500).render('error', { 
            error: 'Failed to load order success page',
            user: req.session.user
        });  
    }
};

const paymentError = async (req, res) => {
    try {
       
        const { error, code, order_id } = req.query;
        
      
        const errorMessage = error || "Your payment could not be processed. Please try again.";
        
        res.render('payment-error', {
            user: req.session.user,
            errorMessage: errorMessage,
            errorCode: code || null,
            orderId: order_id || null
        });
    } catch (error) {
        console.error('Error rendering payment error page:', error);
        res.status(500).render('error', { 
            error: 'An unexpected error occurred',
            user: req.session.user
        });
    }
};

module.exports = {
    loadCheckout,
    placeOrder,
    orderSuccess,
    paymentError
};
