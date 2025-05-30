const Coupon = require('../../models/couponSchema');

// Load coupon management page
const loadCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdOn: -1 });
        
        res.render('coupons', {
            admin: req.session.admin,
            coupons,
            currentPage: 'coupons'
        });
    } catch (error) {
        console.error('Error loading coupons page:', error);
        res.status(500).render('error', { message: 'Failed to load coupons page' });
    }
};

// Create a new coupon
const createCoupon = async (req, res) => {
    try {
        const {
            name,
            description,
            expireOn,
            offerPrice,
            discountType,
            minimumPrice,
            usageLimit
        } = req.body;

        // Validate required fields
        if (!name || !expireOn || !offerPrice || !minimumPrice) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Validate expiry date (must be in the future)
        const expireDate = new Date(expireOn);
        if (expireDate <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Expiry date must be in the future'
            });
        }

        // Validate offer price
        if (offerPrice <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Offer price must be greater than 0'
            });
        }

        // Validate minimum price
        if (minimumPrice < 0) {
            return res.status(400).json({
                success: false,
                message: 'Minimum price cannot be negative'
            });
        }

        // Validate percentage discount (must be between 1 and 100)
        if (discountType === 'percentage' && (offerPrice < 1 || offerPrice > 100)) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount must be between 1 and 100'
            });
        }

        // Check if coupon with same name already exists
        const existingCoupon = await Coupon.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'A coupon with this name already exists'
            });
        }

        // Create new coupon
        const newCoupon = new Coupon({
            name: name.toUpperCase(), // Store coupon names in uppercase
            description,
            expireOn: expireDate,
            offerPrice,
            discountType,
            minimumPrice,
            usageLimit: usageLimit || 0
        });

        await newCoupon.save();

        return res.status(201).json({
            success: true,
            message: 'Coupon created successfully',
            coupon: newCoupon
        });
    } catch (error) {
        console.error('Error creating coupon:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create coupon'
        });
    }
};

// Delete a coupon
const deleteCoupon = async (req, res) => {
    try {
        const { couponId } = req.params;

        const coupon = await Coupon.findById(couponId);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        await Coupon.findByIdAndDelete(couponId);

        return res.status(200).json({
            success: true,
            message: 'Coupon deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting coupon:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete coupon'
        });
    }
};

// Toggle coupon status (active/inactive)
const toggleCouponStatus = async (req, res) => {
    try {
        const { couponId } = req.params;

        const coupon = await Coupon.findById(couponId);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        coupon.isList = !coupon.isList;
        await coupon.save();

        return res.status(200).json({
            success: true,
            message: `Coupon ${coupon.isList ? 'activated' : 'deactivated'} successfully`,
            status: coupon.isList
        });
    } catch (error) {
        console.error('Error toggling coupon status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update coupon status'
        });
    }
};

// Get coupon details for editing
const getCouponDetails = async (req, res) => {
    try {
        const { couponId } = req.params;

        const coupon = await Coupon.findById(couponId);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        return res.status(200).json({
            success: true,
            coupon
        });
    } catch (error) {
        console.error('Error getting coupon details:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get coupon details'
        });
    }
};

// Update an existing coupon
const updateCoupon = async (req, res) => {
    try {
        const { couponId } = req.params;
        const {
            name,
            description,
            expireOn,
            offerPrice,
            discountType,
            minimumPrice,
            usageLimit
        } = req.body;

        // Find the coupon
        const coupon = await Coupon.findById(couponId);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // Validate required fields
        if (!name || !expireOn || !offerPrice || !minimumPrice) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Validate expiry date (must be in the future)
        const expireDate = new Date(expireOn);
        if (expireDate <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Expiry date must be in the future'
            });
        }

        // Validate offer price
        if (offerPrice <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Offer price must be greater than 0'
            });
        }

        // Validate minimum price
        if (minimumPrice < 0) {
            return res.status(400).json({
                success: false,
                message: 'Minimum price cannot be negative'
            });
        }

        // Validate percentage discount (must be between 1 and 100)
        if (discountType === 'percentage' && (offerPrice < 1 || offerPrice > 100)) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount must be between 1 and 100'
            });
        }

        // Check if coupon with same name already exists (excluding current coupon)
        if (name.toUpperCase() !== coupon.name) {
            const existingCoupon = await Coupon.findOne({ 
                name: { $regex: new RegExp(`^${name}$`, 'i') },
                _id: { $ne: couponId }
            });
            
            if (existingCoupon) {
                return res.status(400).json({
                    success: false,
                    message: 'A coupon with this name already exists'
                });
            }
        }

        // Update coupon
        coupon.name = name.toUpperCase();
        coupon.description = description;
        coupon.expireOn = expireDate;
        coupon.offerPrice = offerPrice;
        coupon.discountType = discountType;
        coupon.minimumPrice = minimumPrice;
        coupon.usageLimit = usageLimit || 0;

        await coupon.save();

        return res.status(200).json({
            success: true,
            message: 'Coupon updated successfully',
            coupon
        });
    } catch (error) {
        console.error('Error updating coupon:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update coupon'
        });
    }
};

module.exports = {
    loadCoupons,
    createCoupon,
    getCouponDetails,
    updateCoupon,
    deleteCoupon,
    toggleCouponStatus
};
