const Cart = require('../../models/cartSchema');
const {Product} = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Coupon = require('../../models/couponSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const { sendWalletNotification } = require('../../utils/walletNotifier');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay with your key_id and key_secret
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
            
            // Determine if there's an offer to apply - always use the larger offer
            let appliedOffer = 0;
            let offerType = null;
            
            // Check if product has an offer
            if (product.productOffer && product.productOffer > 0) {
                appliedOffer = product.productOffer;
                offerType = 'product';
            }
            
            // Check if category has an offer and compare with product offer
            if (product.category && product.category.categoryOffer && product.category.categoryOffer > 0) {
                // Only update if category offer is larger than product offer
                if (product.category.categoryOffer > appliedOffer) {
                    appliedOffer = product.category.categoryOffer;
                    offerType = 'category';
                }
            }
            
            // Calculate the final price based on offers and sale price
            let itemPrice;
            if (appliedOffer > 0) {
                // Use sale price as base price if available, otherwise use regular price
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
        
        // Check if there's an applied coupon
        let couponDiscount = 0;
        let couponCode = '';
        
        if (cart.coupon && cart.coupon.discount) {
            couponDiscount = cart.coupon.discount;
            couponCode = cart.coupon.code;
        }
        
        const total = subtotal + shipping + tax - couponDiscount;
        
        // Fetch available coupons for the user
        const currentDate = new Date();
        let availableCoupons = [];
        
        try {
            // First, get all active coupons that haven't expired
            // Use strict date comparison to ensure expired coupons don't show up
            availableCoupons = await Coupon.find({
                isList: true,
                expireOn: { $gt: currentDate }
            }).sort({ offerPrice: -1 }); // Sort by highest discount first
            
            console.log('Current date for coupon filtering:', currentDate);
            console.log('Available coupons before filtering:', availableCoupons.length);
            
            // Then filter them in JavaScript for usage limits, user restrictions, and double-check expiration
            availableCoupons = availableCoupons.filter(coupon => {
                // Double-check expiration date (belt and suspenders approach)
                const notExpired = new Date(coupon.expireOn) > currentDate;
                
                // Check usage limit
                const hasAvailableUses = coupon.usageLimit === 0 || coupon.usageCount < coupon.usageLimit;
                
                // Check if user has already used this coupon
                const userHasNotUsed = !coupon.userId || !Array.isArray(coupon.userId) || !coupon.userId.includes(userId);
                
                return notExpired && hasAvailableUses && userHasNotUsed;
            });
            
            console.log('Available coupons after filtering:', availableCoupons.length);
            console.log('Filtered coupon expiry dates:', availableCoupons.map(c => ({ name: c.name, expiry: c.expireOn })));
        } catch (err) {
            console.error('Error fetching available coupons:', err);
            // Don't throw error, just continue with empty coupons array
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

        // Debug request body
        console.log('Request body:', req.body);
        console.log('Request headers:', req.headers);
        console.log('Content-Type:', req.headers['content-type']);
        console.log('Payment Method (raw):', req.body?.paymentMethod);
        console.log('Payment Method (type):', typeof req.body?.paymentMethod);
        
        // Safely access properties
        const userId = req.session.user._id;
        let addressId, paymentMethod, razorpayPaymentId, razorpayOrderId, razorpaySignature;
        
        // Handle undefined req.body (happens with some content types)
        if (!req.body) {
            // For multipart/form-data or when body parsing fails
            if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
                // Try to extract from the multipart form data
                // Since we're using a direct form submission now, this shouldn't be needed
                // but keeping it for backward compatibility
                return res.status(400).json({
                    success: false,
                    message: 'Unable to process form data. Please try again.'
                });
            }
        } else {
            // Normal form or JSON data
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
        
        // Convert to lowercase for consistent comparison
        const paymentMethodLower = paymentMethod.toLowerCase();
        console.log('Payment method (lowercase):', paymentMethodLower);
        
        // If payment method is Razorpay but we don't have payment details yet, create a Razorpay order
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
            
            // Calculate order total
            let subtotal = 0;
            cart.items.forEach(item => {
                const product = item.product;
                let itemPrice;
                
                // Calculate price with offers
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
            
            // Create a Razorpay order
            const options = {
                amount: total * 100, // Razorpay amount is in paisa (1/100 of INR)
                currency: 'INR',
                receipt: 'order_' + Date.now(),
                payment_capture: 1 // Auto-capture payment
            };
            
            try {
                const razorpayOrder = await razorpay.orders.create(options);
                
                // Return the order details to the client
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
            console.log(razorpaySignature)
            // Verify the payment signature
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
            // Payment is verified, continue with order creation
        }
        
        // For all payment methods, proceed with order creation
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
        
        // Calculate order details
        let subtotal = 0;
        
        const orderItems = cart.items.map(item => {
            const product = item.product;
            
            // Determine if there's an offer to apply - always use the larger offer
            let appliedOffer = 0;
            let offerType = null;
            
            // Check if product has an offer
            if (product.productOffer && product.productOffer > 0) {
                appliedOffer = product.productOffer;
                offerType = 'product';
            }
            
            // Check if category has an offer and compare with product offer
            if (product.category && product.category.categoryOffer && product.category.categoryOffer > 0) {
                // Only update if category offer is larger than product offer
                if (product.category.categoryOffer > appliedOffer) {
                    appliedOffer = product.category.categoryOffer;
                    offerType = 'category';
                }
            }
            
            // Calculate the final price based on offers and sale price
            let itemPrice;
            if (appliedOffer > 0) {
                // Use sale price as base price if available, otherwise use regular price
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
        
        // Check if there's an applied coupon
        let couponDiscount = 0;
        let couponCode = '';
        let couponId = null;
        
        if (cart.coupon && cart.coupon.discount) {
            couponDiscount = cart.coupon.discount;
            couponCode = cart.coupon.code;
            couponId = cart.coupon.couponId;
        }
        
        const total = subtotal + shipping + tax - couponDiscount;

        // Create the new order
        // Handle wallet payment
        let walletTransaction;
        if (paymentMethodLower === 'wallet') {
            // Check if user has sufficient balance
            if (user.wallet < total) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance'
                });
            }
            
            // Deduct the amount from wallet
            user.wallet -= total;
            await user.save();
            
            // Create a temporary transaction record - we'll update it with the order ID later
            walletTransaction = new WalletTransaction({
                user: userId,
                amount: total,
                type: 'debit',
                description: 'Payment for order',
                date: new Date()
            });
            
            // We'll save this after creating the order to include the order ID
            console.log('Created wallet transaction for payment:', walletTransaction);
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

        // If this was a wallet payment, update the transaction with the order ID and save it
        if (paymentMethodLower === 'wallet' && walletTransaction) {
            try {
                walletTransaction.orderId = savedOrder._id;
                walletTransaction.description = `Payment for order #${savedOrder.orderNumber}`;
                const savedTransaction = await walletTransaction.save();
                console.log('Saved wallet transaction:', savedTransaction);
                
                // Send notification about the wallet payment
                await sendWalletNotification(
                    userId,
                    'debit',
                    total,
                    `Payment for order #${savedOrder.orderNumber}`
                );
            } catch (error) {
                console.error('Error saving wallet transaction:', error);
                // Continue with order processing even if wallet transaction saving fails
            }
        }
        
        // Update user's order history
        user.orderHistory.push(savedOrder._id);
        await user.save();
        
        // Clear the user's cart
        await Cart.findOneAndUpdate(
            { user: userId },
            { $set: { items: [], totalAmount: 0, coupon: undefined } }
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

        
        // Check if this is a form submission that expects a redirect (not fetch/AJAX)
        const expectsRedirect = req.headers['content-type'] === 'application/x-www-form-urlencoded' && 
                               !req.xhr && 
                               !req.headers['x-requested-with'];
        
        // For Razorpay payments with form submission, redirect directly
        if (expectsRedirect && ((paymentMethodLower === 'razorpay' && razorpayPaymentId) || paymentMethodLower === 'cod' || paymentMethodLower === 'wallet')) {
            return res.redirect(`/order-success/${savedOrder._id}`);
        }
        
        // For AJAX/fetch requests, return JSON
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
        // Get error details from query parameters
        const { error, code, order_id } = req.query;
        
        // Default error message if none provided
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
