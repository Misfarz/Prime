const Coupon = require("../../models/couponSchema");
const Cart = require("../../models/cartSchema");
const User = require("../../models/userSchema");

const applyCoupon = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: "Please login to apply a coupon",
      });
    }

    const userId = req.session.user._id;
    const { couponCode } = req.body;

    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    let currentDate = new Date();

    const coupon = await Coupon.findOne({
      name: { $regex: new RegExp(`^${couponCode}$`, "i") },
      isList: true,
      expireOn: { $gt: currentDate },
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Invalid coupon code",
      });
    }

    if (new Date(coupon.expireOn) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "This coupon has expired",
      });
    }

    if (coupon.userId.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "You have already used this coupon",
      });
    }

    if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: "This coupon has reached its usage limit",
      });
    }

    const user = await User.findById(userId);
    if (!user || !user.cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const cart = await Cart.findById(user.cart).populate({
      path: "items.product",
      populate: {
        path: "category",
      },
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    let subtotal = 0;

    for (const item of cart.items) {
      const product = item.product;

      let appliedOffer = 0;

      if (product.productOffer && product.productOffer > 0) {
        appliedOffer = product.productOffer;
      }

      if (
        product.category &&
        product.category.categoryOffer &&
        product.category.categoryOffer > 0
      ) {
        if (product.category.categoryOffer > appliedOffer) {
          appliedOffer = product.category.categoryOffer;
        }
      }

      let itemPrice;
      if (appliedOffer > 0) {
        const basePrice =
          product.salePrice && product.salePrice < product.regularPrice
            ? product.salePrice
            : product.regularPrice;
        itemPrice = Math.round(basePrice * (1 - appliedOffer / 100));
      } else if (
        product.salePrice &&
        product.salePrice < product.regularPrice
      ) {
        itemPrice = product.salePrice;
      } else {
        itemPrice = product.regularPrice;
      }

      subtotal += itemPrice * item.quantity;
    }

    if (subtotal < coupon.minimumPrice) {
      return res.status(400).json({
        success: false,
        message: `This coupon requires a minimum purchase of ₹${coupon.minimumPrice}`,
      });
    }

    let discountAmount;
    if (coupon.discountType === "percentage") {
      discountAmount = Math.round((subtotal * coupon.offerPrice) / 100);
    } else {
      discountAmount = coupon.offerPrice;
    }

    cart.coupon = {
      code: coupon.name,
      discount: discountAmount,
      couponId: coupon._id,
    };

    await cart.save();

    coupon.usageCount += 1;
    coupon.userId.push(userId);
    await coupon.save();

    const shipping = 50;
    const tax = Math.round(subtotal * 0.05);
    const total = subtotal + shipping + tax - discountAmount;

    return res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      summary: {
        subtotal,
        discount: discountAmount,
        shipping,
        tax,
        total,
      },
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to apply coupon",
    });
  }
};

const removeCoupon = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: "Please login to remove a coupon",
      });
    }

    const userId = req.session.user._id;

    const user = await User.findById(userId);
    if (!user || !user.cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const cart = await Cart.findById(user.cart).populate({
      path: "items.product",
      populate: {
        path: "category",
      },
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    if (!cart.coupon || !cart.coupon.couponId) {
      return res.status(400).json({
        success: false,
        message: "No coupon applied to remove",
      });
    }

    const couponId = cart.coupon.couponId;
    const coupon = await Coupon.findById(couponId);

    if (coupon) {
      coupon.usageCount = Math.max(0, coupon.usageCount - 1);
      coupon.userId = coupon.userId.filter((id) => id.toString() !== userId);
      await coupon.save();
    }

    cart.coupon = undefined;
    await cart.save();

    let subtotal = 0;

    for (const item of cart.items) {
      const product = item.product;

      let appliedOffer = 0;

      if (product.productOffer && product.productOffer > 0) {
        appliedOffer = product.productOffer;
      }

      if (
        product.category &&
        product.category.categoryOffer &&
        product.category.categoryOffer > 0
      ) {
        if (product.category.categoryOffer > appliedOffer) {
          appliedOffer = product.category.categoryOffer;
        }
      }

      let itemPrice;
      if (appliedOffer > 0) {
        const basePrice =
          product.salePrice && product.salePrice < product.regularPrice
            ? product.salePrice
            : product.regularPrice;
        itemPrice = Math.round(basePrice * (1 - appliedOffer / 100));
      } else if (
        product.salePrice &&
        product.salePrice < product.regularPrice
      ) {
        itemPrice = product.salePrice;
      } else {
        itemPrice = product.regularPrice;
      }

      subtotal += itemPrice * item.quantity;
    }

    const shipping = 50;
    const tax = Math.round(subtotal * 0.05);
    const total = subtotal + shipping + tax;

    return res.status(200).json({
      success: true,
      message: "Coupon removed successfully",
      summary: {
        subtotal,
        shipping,
        tax,
        total,
      },
    });
  } catch (error) {
    console.error("Error removing coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove coupon",
    });
  }
};

module.exports = {
  applyCoupon,
  removeCoupon,
};
