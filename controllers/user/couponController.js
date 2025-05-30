const Coupon = require('../../models/couponSchema');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');

// Apply a coupon to the user's cart
const applyCoupon = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Please login to apply a coupon' 
            });
        }

        const userId = req.session.user._id;
        const { couponCode } = req.body;

        if (!couponCode) {
            return res.status(400).json({ 
                success: false, 
                message: 'Coupon code is required' 
            });
        }

        // Find the coupon (case insensitive) and ensure it's not expired
        const currentDate = new Date();
        console.log('Current date for coupon application:', currentDate);
        
        const coupon = await Coupon.findOne({ 
            name: { $regex: new RegExp(`^${couponCode}$`, 'i') },
            isList: true,
            expireOn: { $gt: currentDate } // Only get non-expired coupons
        });

        if (!coupon) {
            return res.status(404).json({ 
                success: false, 
                message: 'Invalid coupon code' 
            });
        }

        // Check if coupon is expired
        if (new Date(coupon.expireOn) < new Date()) {
            return res.status(400).json({ 
                success: false, 
                message: 'This coupon has expired' 
            });
        }

        // Check if user has already used this coupon
        if (coupon.userId.includes(userId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already used this coupon' 
            });
        }

        // Check if coupon has reached its usage limit
        if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
            return res.status(400).json({ 
                success: false, 
                message: 'This coupon has reached its usage limit' 
            });
        }

        // Get user's cart
        const user = await User.findById(userId);
        if (!user || !user.cart) {
            return res.status(404).json({ 
                success: false, 
                message: 'Cart not found' 
            });
        }

        const cart = await Cart.findById(user.cart).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Your cart is empty' 
            });
        }

        // Calculate cart subtotal using the same pricing logic as in checkout
        let subtotal = 0;
        
        for (const item of cart.items) {
            const product = item.product;
            
            // Determine if there's an offer to apply
            let appliedOffer = 0;
            
            // Check if product has an offer
            if (product.productOffer && product.productOffer > 0) {
                appliedOffer = product.productOffer;
            }
            
            // Check if category has an offer and compare with product offer
            if (product.category && product.category.categoryOffer && product.category.categoryOffer > 0) {
                // Only update if category offer is larger than product offer
                if (product.category.categoryOffer > appliedOffer) {
                    appliedOffer = product.category.categoryOffer;
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
            
            subtotal += itemPrice * item.quantity;
        }

        // Check if cart meets minimum purchase requirement
        if (subtotal < coupon.minimumPrice) {
            return res.status(400).json({ 
                success: false, 
                message: `This coupon requires a minimum purchase of ₹${coupon.minimumPrice}` 
            });
        }

        // Calculate discount amount
        let discountAmount;
        if (coupon.discountType === 'percentage') {
            discountAmount = Math.round((subtotal * coupon.offerPrice) / 100);
        } else {
            discountAmount = coupon.offerPrice;
        }

        // Store coupon in cart
        cart.coupon = {
            code: coupon.name,
            discount: discountAmount,
            couponId: coupon._id
        };
        
        await cart.save();

        // Increment coupon usage count
        coupon.usageCount += 1;
        coupon.userId.push(userId);
        await coupon.save();

        // Calculate new totals
        const shipping = 50;
        const tax = Math.round(subtotal * 0.05);
        const total = subtotal + shipping + tax - discountAmount;

        return res.status(200).json({ 
            success: true, 
            message: 'Coupon applied successfully',
            summary: {
                subtotal,
                discount: discountAmount,
                shipping,
                tax,
                total
            }
        });
    } catch (error) {
        console.error('Error applying coupon:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to apply coupon' 
        });
    }
};

// Remove a coupon from the user's cart
const removeCoupon = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Please login to remove a coupon' 
            });
        }

        const userId = req.session.user._id;

        // Get user's cart
        const user = await User.findById(userId);
        if (!user || !user.cart) {
            return res.status(404).json({ 
                success: false, 
                message: 'Cart not found' 
            });
        }

        const cart = await Cart.findById(user.cart).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        });

        if (!cart) {
            return res.status(404).json({ 
                success: false, 
                message: 'Cart not found' 
            });
        }

        // Check if cart has a coupon
        if (!cart.coupon || !cart.coupon.couponId) {
            return res.status(400).json({ 
                success: false, 
                message: 'No coupon applied to remove' 
            });
        }

        // Get coupon details
        const couponId = cart.coupon.couponId;
        const coupon = await Coupon.findById(couponId);

        // Remove user from coupon's userId array and decrement usage count
        if (coupon) {
            coupon.usageCount = Math.max(0, coupon.usageCount - 1);
            coupon.userId = coupon.userId.filter(id => id.toString() !== userId);
            await coupon.save();
        }

        // Remove coupon from cart
        cart.coupon = undefined;
        await cart.save();

        // Calculate cart subtotal using the same pricing logic as in checkout
        let subtotal = 0;
        
        for (const item of cart.items) {
            const product = item.product;
            
            // Determine if there's an offer to apply
            let appliedOffer = 0;
            
            // Check if product has an offer
            if (product.productOffer && product.productOffer > 0) {
                appliedOffer = product.productOffer;
            }
            
            // Check if category has an offer and compare with product offer
            if (product.category && product.category.categoryOffer && product.category.categoryOffer > 0) {
                // Only update if category offer is larger than product offer
                if (product.category.categoryOffer > appliedOffer) {
                    appliedOffer = product.category.categoryOffer;
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
            
            subtotal += itemPrice * item.quantity;
        }

        // Calculate new totals
        const shipping = 50;
        const tax = Math.round(subtotal * 0.05);
        const total = subtotal + shipping + tax;

        return res.status(200).json({ 
            success: true, 
            message: 'Coupon removed successfully',
            summary: {
                subtotal,
                shipping,
                tax,
                total
            }
        });
    } catch (error) {
        console.error('Error removing coupon:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to remove coupon' 
        });
    }
};

module.exports = {
    applyCoupon,
    removeCoupon
};
