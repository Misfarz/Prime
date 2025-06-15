const mongoose = require("mongoose");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");

const loadWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;

    const user = await User.findById(userId);

    if (!user) {
      return res.redirect("/login");
    }

    const wishlistItems = await Product.find({
      _id: { $in: user.whishlist || [] },
      isListed: true,
    });

    res.render("wishlist", {
      user: user,
      wishlistItems: wishlistItems,
    });
  } catch (error) {
    console.error("Failed to load wishlist:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};

const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const productId = req.params.productId;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const product = await Product.findOne({ _id: productId, isListed: true });
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found or unavailable" });
    }

    const user = await User.findById(userId);
    if (user.whishlist && user.whishlist.includes(productId)) {
      return res
        .status(200)
        .json({
          success: true,
          message: "Product already in wishlist",
          inWishlist: true,
        });
    }

    await User.findByIdAndUpdate(userId, {
      $addToSet: { whishlist: productId },
    });
    res
      .status(200)
      .json({
        success: true,
        message: "Product added to wishlist",
        inWishlist: true,
      });
  } catch (error) {
    console.error("Failed to add to wishlist:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const productId = req.params.productId;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    await User.findByIdAndUpdate(userId, { $pull: { whishlist: productId } });

    res
      .status(200)
      .json({
        success: true,
        message: "Product removed from wishlist",
        inWishlist: false,
      });
  } catch (error) {
    console.error("Failed to remove from wishlist:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const checkWishlistStatus = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(200).json({ inWishlist: false });
    }

    const userId = req.session.user._id;
    const productId = req.params.productId;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product ID" });
    }

    const user = await User.findById(userId);
    const inWishlist = user.whishlist && user.whishlist.includes(productId);

    res.status(200).json({ inWishlist });
  } catch (error) {
    console.error("Failed to check wishlist status:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  loadWishlist,
  addToWishlist,
  removeFromWishlist,
  checkWishlistStatus,
};
