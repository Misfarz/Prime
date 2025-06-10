const Coupon = require('../../models/couponSchema');


const loadCoupons = async (req, res) => {
    try {
        // Fetch all coupons
        const coupons = await Coupon.find().sort({ createdOn: -1 });
        
        // Calculate accurate usage count based on userId array length
        const couponsWithAccurateCount = coupons.map(coupon => {
            // Create a plain JavaScript object from the Mongoose document
            const couponObj = coupon.toObject();
            
            // Set the usageCount to the length of the userId array
            // This ensures the count shown in the admin panel is accurate
            couponObj.usageCount = coupon.userId ? coupon.userId.length : 0;
            
            return couponObj;
        });
        
        res.render('coupons', {
            admin: req.session.admin,
            coupons: couponsWithAccurateCount,
            currentPage: 'coupons'
        });
    } catch (error) {
        console.error('Error loading coupons page:', error);
        res.status(500).render('error', { message: 'Failed to load coupons page' });
    }
};


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

       
        if (!name || !expireOn || !offerPrice || !minimumPrice) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

       
        const expireDate = new Date(expireOn);
        if (expireDate <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Expiry date must be in the future'
            });
        }

   
        if (offerPrice <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Offer price must be greater than 0'
            });
        }

        if (minimumPrice < 0) {
            return res.status(400).json({
                success: false,
                message: 'Minimum price cannot be negative'
            });
        }

      
        if (discountType === 'percentage' && (offerPrice < 1 || offerPrice > 100)) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount must be between 1 and 100'
            });
        }

       
        const existingCoupon = await Coupon.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'A coupon with this name already exists'
            });
        }

        
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

        
        const coupon = await Coupon.findById(couponId);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

      
        if (!name || !expireOn || !offerPrice || !minimumPrice) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

   
        const expireDate = new Date(expireOn);
        if (expireDate <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Expiry date must be in the future'
            });
        }

   
        if (offerPrice <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Offer price must be greater than 0'
            });
        }

       
        if (minimumPrice < 0) {
            return res.status(400).json({
                success: false,
                message: 'Minimum price cannot be negative'
            });
        }

       
        if (discountType === 'percentage' && (offerPrice < 1 || offerPrice > 100)) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount must be between 1 and 100'
            });
        }


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
