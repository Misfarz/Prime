const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../../models/userSchema");
const Address = require('../../models/addressSchema');
const { Product } = require('../../models/productSchema');
const Order = require('../../models/orderSchema');


const loadProfile = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const userData = await User.findById(user._id).populate('addresses');
        const addresses = userData.addresses || [];
        
       
        const activeTab = req.query.tab || 'details';
        
       
        let orders = [];
        if (activeTab === 'orders') {
           
            const searchQuery = req.query.search || '';
            
           
            let filter = { user: user._id };
            
            // Add search functionality
            if (searchQuery) {
                filter.$or = [
                    { orderNumber: { $regex: searchQuery, $options: 'i' } },
                    { orderStatus: { $regex: searchQuery, $options: 'i' } }
                ];
            }

            const page = parseInt(req.query.page) || 1;
            const limit = 5; 
            const skip = (page - 1) * limit;
            
            orders = await Order.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
                
            const totalOrders = await Order.countDocuments(filter);
            const totalPages = Math.ceil(totalOrders / limit);
            
            return res.render('profile', {
                user: userData,
                addresses,
                activeTab,
                orders,
                currentPage: page,
                totalPages,
                searchQuery
            });
        }

        res.render('profile', {
            user: userData,
            addresses,
            activeTab,
            orders: []
        });
    } catch (error) {
        console.error("Failed to load profile:", error);
        res.status(500).render("page-404", { message: "Server Error" });
    }
};

const loadEditProfile = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const userData = await User.findById(user._id);
        
        res.render('edit-profile', {
            user: userData,
            error: null
        });
    } catch (error) {
        console.error("Failed to load edit profile:", error);
        res.status(500).render("page-404", { message: "Server Error" });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { name, phone } = req.body;
        
    
        if (!name) {
            return res.render('edit-profile', {
                user: { ...req.session.user, name, phone },
                error: 'Name is required'
            });
        }
        
        // Phone validation (if provided)
        if (phone && !/^\d{10}$/.test(phone)) {
            return res.render('edit-profile', {
                user: { ...req.session.user, name, phone },
                error: 'Phone number must be 10 digits'
            });
        }
        
        // Update profile image if uploaded
        const updateData = { name, phone };
        if (req.file) {
            updateData.profileImage = `/uploads/profiles/${req.file.filename}`;
        }
        
        // Update user in database
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        );
        
        // Update session
        req.session.user = {
            ...req.session.user,
            name: updatedUser.name,
            phone: updatedUser.phone,
            profileImage: updatedUser.profileImage
        };
        
        res.redirect('/profile');
    } catch (error) {
        console.error("Failed to update profile:", error);
        res.status(500).render('edit-profile', {
            user: req.session.user,
            error: 'An error occurred while updating your profile'
        });
    }
};

// Password management
const loadChangePassword = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }
        
        const userData = await User.findById(user._id);
        
        // If user signed up with Google, they don't have a password
        if (userData.googleId && !userData.password) {
            return res.render('profile', {
                user: userData,
                activeTab: 'profile',
                error: 'You signed up with Google. Password change is not available.'
            });
        }
        
        res.render('change-password', {
            user: userData,
            error: null,
            success: null
        });
    } catch (error) {
        console.error("Failed to load change password page:", error);
        res.status(500).render("page-404", { message: "Server Error" });
    }
};

const changePassword = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        // Fetch user
        const user = await User.findById(userId);
        
        // Check if user exists
        if (!user) {
            return res.render('change-password', {
                user: req.session.user,
                error: 'User not found',
                success: null
            });
        }
        
        // If user signed up with Google and doesn't have a password
        if (user.googleId && !user.password) {
            return res.render('profile', {
                user: user,
                activeTab: 'profile',
                error: 'You signed up with Google. Password change is not available.'
            });
        }
        
        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return res.render('change-password', {
                user: req.session.user,
                error: 'Current password is incorrect',
                success: null
            });
        }
        
        // Validate new password
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.render('change-password', {
                user: req.session.user,
                error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character',
                success: null
            });
        }
        
        // Check if new passwords match
        if (newPassword !== confirmPassword) {
            return res.render('change-password', {
                user: req.session.user,
                error: 'New passwords do not match',
                success: null
            });
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password
        await User.findByIdAndUpdate(userId, { password: hashedPassword });
        
        // Return success
        res.render('change-password', {
            user: req.session.user,
            error: null,
            success: 'Password changed successfully'
        });
    } catch (error) {
        console.error("Failed to change password:", error);
        res.status(500).render('change-password', {
            user: req.session.user,
            error: 'An error occurred while changing your password',
            success: null
        });
    }
};

// Address management
const loadAddressManagement = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }
        
        const userData = await User.findById(user._id).populate('addresses');
        const addresses = userData.addresses || [];
        
        res.render('address-management', {
            user: userData,
            addresses,
            activeTab: 'addresses',
            error: null,
            success: null
        });
    } catch (error) {
        console.error("Failed to load address management:", error);
        res.status(500).render("page-404", { message: "Server Error" });
    }
};

const addAddress = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const {
            fullName,
            phone,
            addressLine1,
            addressLine2,
            city,
            state,
            postalCode,
            country,
            isDefault,
            redirectTo
        } = req.body;
        
        // Validation
        if (!fullName || !phone || !addressLine1 || !city || !state || !postalCode || !country) {
            const userData = await User.findById(userId).populate('addresses');
            return res.render('address-management', {
                user: userData,
                addresses: userData.addresses || [],
                activeTab: 'addresses',
                error: 'Please fill all required fields',
                success: null
            });
        }
        
        // Phone validation
        if (!/^\d{10}$/.test(phone)) {
            const userData = await User.findById(userId).populate('addresses');
            return res.render('address-management', {
                user: userData,
                addresses: userData.addresses || [],
                activeTab: 'addresses',
                error: 'Phone number must be 10 digits',
                success: null
            });
        }
        
        // Check if this is the first address (should be default)
        const addressCount = await Address.countDocuments({ userId: userId });
        const makeDefault = isDefault === 'on' || addressCount === 0;
        
        // If this is set as default, unset any other default addresses first
        if (makeDefault) {
            await Address.updateMany(
                { userId: userId },
                { isDefault: false }
            );
        }
        
        // Create new address
        const newAddress = new Address({
            userId: userId,
            fullName,
            phone,
            addressLine1,
            addressLine2: addressLine2 || '',
            city,
            state,
            postalCode,
            country,
            isDefault: makeDefault
        });
        
        // Save address
        const savedAddress = await newAddress.save();
        
        // Add address to user's addresses array
        await User.findByIdAndUpdate(
            userId,
            { $addToSet: { addresses: savedAddress._id } }
        );
        
        // Redirect based on redirectTo parameter or default to address management
        if (redirectTo && redirectTo === 'checkout') {
            res.redirect('/checkout');
        } else {
            res.redirect('/profile/addresses');
        }
    } catch (error) {
        console.error("Failed to add address:", error);
        res.status(500).render("page-404", { message: "Server Error" });
    }
};

const editAddress = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const addressId = req.params.addressId;
        const {
            fullName,
            phone,
            addressLine1,
            addressLine2,
            city,
            state,
            postalCode,
            country,
            isDefault,
            redirectTo
        } = req.body;
        
        // Validation
        if (!fullName || !phone || !addressLine1 || !city || !state || !postalCode || !country) {
            const userData = await User.findById(userId).populate('addresses');
            return res.render('address-management', {
                user: userData,
                addresses: userData.addresses || [],
                activeTab: 'addresses',
                error: 'Please fill all required fields',
                success: null
            });
        }
        
        // Phone validation
        if (!/^\d{10}$/.test(phone)) {
            const userData = await User.findById(userId).populate('addresses');
            return res.render('address-management', {
                user: userData,
                addresses: userData.addresses || [],
                activeTab: 'addresses',
                error: 'Phone number must be 10 digits',
                success: null
            });
        }
        
        // If making this address default, unset any other default addresses first
        const makeDefault = isDefault === 'on';
        if (makeDefault) {
            await Address.updateMany(
                { userId: userId },
                { isDefault: false }
            );
        }
        
        // Update address
        const updatedAddress = await Address.findOneAndUpdate(
            { _id: addressId, userId: userId },
            {
                fullName,
                phone,
                addressLine1,
                addressLine2: addressLine2 || '',
                city,
                state,
                postalCode,
                country,
                isDefault: makeDefault
            },
            { new: true }
        );
        
        // If not found or not belonging to user
        if (!updatedAddress) {
            const userData = await User.findById(userId).populate('addresses');
            return res.render('address-management', {
                user: userData,
                addresses: userData.addresses || [],
                activeTab: 'addresses',
                error: 'Address not found',
                success: null
            });
        }
        
        // Redirect based on redirectTo parameter or default to address management
        if (redirectTo && redirectTo === 'checkout') {
            res.redirect('/checkout');
        } else {
            res.redirect('/profile/addresses');
        }
    } catch (error) {
        console.error("Failed to edit address:", error);
        res.status(500).render("page-404", { message: "Server Error" });
    }
};

const deleteAddress = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const addressId = req.params.addressId;
        
        // Find address
        const address = await Address.findOne({ _id: addressId, userId: userId });
        
        // If not found or not belonging to user
        if (!address) {
            const userData = await User.findById(userId).populate('addresses');
            return res.render('address-management', {
                user: userData,
                addresses: userData.addresses || [],
                activeTab: 'addresses',
                error: 'Address not found',
                success: null
            });
        }
        
        // Check if this was a default address
        const wasDefault = address.isDefault;
        
        // Remove address from user's addresses array
        await User.findByIdAndUpdate(
            userId,
            { $pull: { addresses: addressId } }
        );
        
        // Delete address
        await Address.findByIdAndDelete(addressId);
        
        // If the deleted address was default, set another address as default if any exist
        if (wasDefault) {
            const firstAddress = await Address.findOne({ userId: userId });
            if (firstAddress) {
                await Address.findByIdAndUpdate(firstAddress._id, { isDefault: true });
            }
        }
        
        // Redirect to address management
        res.redirect('/profile/addresses');
    } catch (error) {
        console.error("Failed to delete address:", error);
        res.status(500).render("page-404", { message: "Server Error" });
    }
};

// Get address data for editing
const getAddressData = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const addressId = req.params.addressId;
        
        // Find address
        const address = await Address.findOne({ _id: addressId, userId: userId });
        
        // If not found or not belonging to user
        if (!address) {
            return res.status(404).json({ error: 'Address not found' });
        }
        
        // Return address data
        res.json(address);
    } catch (error) {
        console.error("Failed to get address data:", error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Wishlist management moved to wishlistController.js

module.exports = {
    // Profile management
    loadProfile,
    loadEditProfile,
    updateProfile,
    
    // Password management
    loadChangePassword,
    changePassword,
    
    // Address management
    loadAddressManagement,
    addAddress,
    editAddress,
    deleteAddress,
    getAddressData
};
