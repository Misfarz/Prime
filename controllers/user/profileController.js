const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");

const loadProfile = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.redirect("/login");
    }

    // Always fetch the latest user data from the database to ensure wallet balance is up-to-date
    let userData = await User.findById(user._id).populate("addresses");

    // If the user doesn't have a referral code yet, generate one
    if (!userData.referalCode) {
      const namePrefix = userData.name.substring(0, 3).toUpperCase();
      const randomChars = Math.random()
        .toString(36)
        .substring(2, 7)
        .toUpperCase();
      const timestamp = Date.now().toString().slice(-4);
      userData.referalCode = `${namePrefix}${randomChars}${timestamp}`;
      await userData.save();
    }

    // Update the session user data with the latest wallet balance and referral code
    if (userData) {
      req.session.user.wallet = userData.wallet;
      req.session.user.referalCode = userData.referalCode;
    }
    const addresses = userData.addresses || [];

    const activeTab = req.query.tab || "details";

    let orders = [];
    let walletTransactions = [];
    let currentPage, totalPages, searchQuery;

    if (activeTab === "referrals") {
      // For referrals tab, populate referred users
      userData = await User.findById(user._id).populate("redeemedUsers");
    } else if (activeTab === "orders") {
      searchQuery = req.query.search || "";

      let filter = { user: user._id };

      // Add search functionality
      if (searchQuery) {
        filter.$or = [
          { orderNumber: { $regex: searchQuery, $options: "i" } },
          { orderStatus: { $regex: searchQuery, $options: "i" } },
        ];
      }

      currentPage = parseInt(req.query.page) || 1;
      const limit = 5;
      const skip = (currentPage - 1) * limit;

      orders = await Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const totalOrders = await Order.countDocuments(filter);
      totalPages = Math.ceil(totalOrders / limit);

      return res.render("profile", {
        user: userData,
        addresses,
        activeTab,
        orders,
        currentPage,
        totalPages,
        searchQuery,
      });
    } else if (activeTab === "wallet") {
      // Handle wallet tab
      currentPage = parseInt(req.query.page) || 1;
      const limit = 10;
      const skip = (currentPage - 1) * limit;

      walletTransactions = await WalletTransaction.find({ user: user._id })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .populate("orderId", "orderNumber");

      const totalTransactions = await WalletTransaction.countDocuments({
        user: user._id,
      });
      totalPages = Math.ceil(totalTransactions / limit);

      return res.render("profile", {
        user: userData,
        addresses,
        activeTab,
        walletTransactions,
        currentPage,
        totalPages,
      });
    }

    res.render("profile", {
      user: userData,
      addresses,
      activeTab,
      orders: [],
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
      return res.redirect("/login");
    }

    const userData = await User.findById(user._id);

    res.render("edit-profile", {
      user: userData,
      error: null,
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
      return res.render("edit-profile", {
        user: { ...req.session.user, name, phone },
        error: "Name is required",
      });
    }

    if (phone && !/^\d{10}$/.test(phone)) {
      return res.render("edit-profile", {
        user: { ...req.session.user, name, phone },
        error: "Phone number must be 10 digits",
      });
    }

    const updateData = { name, phone };
    if (req.file) {
      updateData.profileImage = `/uploads/profiles/${req.file.filename}`;
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    });

    req.session.user = {
      ...req.session.user,
      name: updatedUser.name,
      phone: updatedUser.phone,
      profileImage: updatedUser.profileImage,
    };

    res.redirect("/profile");
  } catch (error) {
    console.error("Failed to update profile:", error);
    res.status(500).render("edit-profile", {
      user: req.session.user,
      error: "An error occurred while updating your profile",
    });
  }
};

const loadChangePassword = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.redirect("/login");
    }

    const userData = await User.findById(user._id);

    if (userData.googleId && !userData.password) {
      return res.render("profile", {
        user: userData,
        activeTab: "profile",
        error: "You signed up with Google. Password change is not available.",
      });
    }

    res.render("change-password", {
      user: userData,
      error: null,
      success: null,
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

    const user = await User.findById(userId);

    if (!user) {
      return res.render("change-password", {
        user: req.session.user,
        error: "User not found",
        success: null,
      });
    }

    if (user.googleId && !user.password) {
      return res.render("profile", {
        user: user,
        activeTab: "profile",
        error: "You signed up with Google. Password change is not available.",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isPasswordValid) {
      return res.render("change-password", {
        user: req.session.user,
        error: "Current password is incorrect",
        success: null,
      });
    }

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.render("change-password", {
        user: req.session.user,
        error:
          "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
        success: null,
      });
    }

    if (newPassword !== confirmPassword) {
      return res.render("change-password", {
        user: req.session.user,
        error: "New passwords do not match",
        success: null,
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.findByIdAndUpdate(userId, { password: hashedPassword });

    res.render("change-password", {
      user: req.session.user,
      error: null,
      success: "Password changed successfully",
    });
  } catch (error) {
    console.error("Failed to change password:", error);
    res.status(500).render("change-password", {
      user: req.session.user,
      error: "An error occurred while changing your password",
      success: null,
    });
  }
};

const loadAddressManagement = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.redirect("/login");
    }

    const userData = await User.findById(user._id).populate("addresses");
    const addresses = userData.addresses || [];

    res.render("address-management", {
      user: userData,
      addresses,
      activeTab: "addresses",
      error: null,
      success: null,
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
    } = req.body;

    if (
      !fullName ||
      !phone ||
      !addressLine1 ||
      !city ||
      !state ||
      !postalCode ||
      !country
    ) {
      const userData = await User.findById(userId).populate("addresses");
      return res.render("address-management", {
        user: userData,
        addresses: userData.addresses || [],
        activeTab: "addresses",
        error: "Please fill all required fields",
        success: null,
      });
    }

    if (!/^\d{10}$/.test(phone)) {
      const userData = await User.findById(userId).populate("addresses");
      return res.render("address-management", {
        user: userData,
        addresses: userData.addresses || [],
        activeTab: "addresses",
        error: "Phone number must be 10 digits",
        success: null,
      });
    }

    const addressCount = await Address.countDocuments({ userId: userId });
    const makeDefault = isDefault === "on" || addressCount === 0;

    if (makeDefault) {
      await Address.updateMany({ userId: userId }, { isDefault: false });
    }

    const newAddress = new Address({
      userId: userId,
      fullName,
      phone,
      addressLine1,
      addressLine2: addressLine2 || "",
      city,
      state,
      postalCode,
      country,
      isDefault: makeDefault,
    });

    const savedAddress = await newAddress.save();

    await User.findByIdAndUpdate(userId, {
      $addToSet: { addresses: savedAddress._id },
    });

    // Redirect to the specified page or default to profile/addresses
    const redirectUrl = req.body.redirect || "/profile/addresses";
    res.redirect(redirectUrl);
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
    } = req.body;

    if (
      !fullName ||
      !phone ||
      !addressLine1 ||
      !city ||
      !state ||
      !postalCode ||
      !country
    ) {
      const userData = await User.findById(userId).populate("addresses");
      return res.render("address-management", {
        user: userData,
        addresses: userData.addresses || [],
        activeTab: "addresses",
        error: "Please fill all required fields",
        success: null,
      });
    }

    if (!/^\d{10}$/.test(phone)) {
      const userData = await User.findById(userId).populate("addresses");
      return res.render("address-management", {
        user: userData,
        addresses: userData.addresses || [],
        activeTab: "addresses",
        error: "Phone number must be 10 digits",
        success: null,
      });
    }

    const makeDefault = isDefault === "on";
    if (makeDefault) {
      await Address.updateMany({ userId: userId }, { isDefault: false });
    }

    const updatedAddress = await Address.findOneAndUpdate(
      { _id: addressId, userId: userId },
      {
        fullName,
        phone,
        addressLine1,
        addressLine2: addressLine2 || "",
        city,
        state,
        postalCode,
        country,
        isDefault: makeDefault,
      },
      { new: true }
    );

    if (!updatedAddress) {
      const userData = await User.findById(userId).populate("addresses");
      return res.render("address-management", {
        user: userData,
        addresses: userData.addresses || [],
        activeTab: "addresses",
        error: "Address not found",
        success: null,
      });
    }

    // Redirect to the specified page or default to profile/addresses
    const redirectUrl = req.body.redirect || "/profile/addresses";
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Failed to edit address:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.addressId;

    const address = await Address.findOne({ _id: addressId, userId: userId });

    if (!address) {
      const userData = await User.findById(userId).populate("addresses");
      return res.render("address-management", {
        user: userData,
        addresses: userData.addresses || [],
        activeTab: "addresses",
        error: "Address not found",
        success: null,
      });
    }

    const wasDefault = address.isDefault;

    await User.findByIdAndUpdate(userId, { $pull: { addresses: addressId } });

    await Address.findByIdAndDelete(addressId);

    if (wasDefault) {
      const firstAddress = await Address.findOne({ userId: userId });
      if (firstAddress) {
        await Address.findByIdAndUpdate(firstAddress._id, { isDefault: true });
      }
    }

    res.redirect("/profile/addresses");
  } catch (error) {
    console.error("Failed to delete address:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};

const getAddressData = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const addressId = req.params.addressId;

    // Find the address by ID and ensure it belongs to the current user
    const address = await Address.findOne({ _id: addressId, userId: userId });

    if (!address) {
      return res.status(404).json({ error: "Address not found" });
    }

    // Return the address data as JSON
    res.json({
      fullName: address.fullName,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 || "",
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      phone: address.phone,
      isDefault: address.isDefault,
    });
  } catch (error) {
    console.error("Failed to get address data:", error);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  loadProfile,
  loadEditProfile,
  updateProfile,
  loadChangePassword,
  changePassword,
  loadAddressManagement,
  addAddress,
  editAddress,
  deleteAddress,
  getAddressData,
};
