const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");

const loadCheckout = async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.redirect("/login");
    }

    const addresses = await Address.find({ userId: userId }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
      },
    });

    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart?error=Cart is empty");
    }

    let subtotal = 0;

    const cartItems = cart.items.map((item) => {
      const product = item.product;

      let appliedOffer = 0;
      let offerType = null;

      if (product.productOffer && product.productOffer > 0) {
        appliedOffer = product.productOffer;
        offerType = "product";
      }

      if (
        product.category &&
        product.category.categoryOffer &&
        product.category.categoryOffer > 0
      ) {
        if (product.category.categoryOffer > appliedOffer) {
          appliedOffer = product.category.categoryOffer;
          offerType = "category";
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

      const itemTotal = itemPrice * item.quantity;
      subtotal += itemTotal;

      return {
        ...item.toObject(),
        itemPrice,
        itemTotal,
        appliedOffer,
        offerType,
      };
    });

    const shipping = 50;
    const tax = Math.round(subtotal * 0.05);

    let couponDiscount = 0;
    let couponCode = "";

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
        expireOn: { $gt: currentDate },
      }).sort({ offerPrice: -1 });

      availableCoupons = availableCoupons.filter((coupon) => {
        const notExpired = new Date(coupon.expireOn) > currentDate;
        const hasAvailableUses =
          coupon.usageLimit === 0 || coupon.usageCount < coupon.usageLimit;
        const userHasNotUsed =
          !coupon.userId ||
          !Array.isArray(coupon.userId) ||
          !coupon.userId.includes(userId);

        return notExpired && hasAvailableUses && userHasNotUsed;
      });
    } catch (err) {
      console.error("Error fetching available coupons:", err);
      availableCoupons = [];
    }

    res.render("checkout", {
      user,
      addresses,
      cart: {
        items: cartItems,
        coupon: cart.coupon,
      },
      summary: {
        subtotal,
        shipping,
        tax,
        couponDiscount,
        couponCode,
        total,
      },
      availableCoupons,
    });
  } catch (error) {
    console.error("Error loading checkout", error);
    res.status(500).render("error", {
      error: "Failed to load checkout page",
      user: req.session.user,
    });
  }
};

const placeOrder = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user._id;
    const addressId = req.body.addressId;

    if (!addressId) {
      return res.status(400).json({
        success: false,
        message: "Address is required",
      });
    }

    const user = await User.findById(userId);
    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
      },
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    const selectedAddress = await Address.findOne({
      _id: addressId,
      userId: userId,
    });
    if (!selectedAddress) {
      return res.status(400).json({
        success: false,
        message: "Invalid address selected",
      });
    }

    let subtotal = 0;

    const orderItems = cart.items.map((item) => {
      const product = item.product;

      let appliedOffer = 0;
      let offerType = null;

      if (product.productOffer && product.productOffer > 0) {
        appliedOffer = product.productOffer;
        offerType = "product";
      }

      if (
        product.category &&
        product.category.categoryOffer &&
        product.category.categoryOffer > 0
      ) {
        if (product.category.categoryOffer > appliedOffer) {
          appliedOffer = product.category.categoryOffer;
          offerType = "category";
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

      const itemTotal = itemPrice * item.quantity;
      subtotal += itemTotal;

      return {
        product: item.product._id,
        quantity: item.quantity,
        size: item.size,
        price: itemPrice,
        total: itemTotal,
      };
    });

    const shipping = 50;
    const tax = Math.round(subtotal * 0.05);

    let couponDiscount = 0;
    let couponCode = "";
    let couponId = null;

    if (cart.coupon && cart.coupon.discount) {
      couponDiscount = cart.coupon.discount;
      couponCode = cart.coupon.code;
      couponId = cart.coupon.couponId;
    }

    const total = subtotal + shipping + tax - couponDiscount;

    const newOrder = new Order({
      user: userId,
      items: orderItems,
      shippingAddress: {
        fullName: selectedAddress.fullName,
        addressLine1: selectedAddress.addressLine1,
        addressLine2: selectedAddress.addressLine2 || "",
        city: selectedAddress.city,
        state: selectedAddress.state,
        postalCode: selectedAddress.postalCode,
        country: selectedAddress.country,
        phone: selectedAddress.phone,
      },
      orderStatus: "Placed",
      subtotal,
      shipping,
      tax,
      discount: couponDiscount,
      couponCode: couponCode,
      total,
    });

    const savedOrder = await newOrder.save();

    user.orderHistory.push(savedOrder._id);
    await user.save();

    if (cart.coupon && cart.coupon.couponId) {
      const coupon = await Coupon.findById(cart.coupon.couponId);
      if (coupon) {
        if (!coupon.userId.includes(userId)) {
          coupon.userId.push(userId);
          coupon.usageCount += 1;
        }
        await coupon.save();
        console.log(
          `Permanently recorded coupon usage for user ${userId} and coupon ${coupon.name}. Usage count: ${coupon.usageCount}`
        );
      }
    }

    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { items: [], totalAmount: 0 }, $unset: { coupon: 1 } }
    );

    for (const item of cart.items) {
      try {
        const productId =
          typeof item.product === "object" ? item.product._id : item.product;
        const size = item.size;

        const product = await Product.findById(productId);

        if (!product) {
          console.error(`Product not found: ${productId}`);
          continue;
        }

        const sizeIndex = product.sizes.findIndex((s) => s.size === size);

        if (sizeIndex !== -1) {
          product.sizes[sizeIndex].quantity = Math.max(
            0,
            product.sizes[sizeIndex].quantity - item.quantity
          );

          const allSizesOutOfStock = product.sizes.every(
            (s) => s.quantity <= 0
          );

          if (allSizesOutOfStock) {
            product.status = "Out of stock";
          }

          await product.save();

          console.log(
            `Updated stock for ${product.productName}, size ${size}: ${product.sizes[sizeIndex].quantity}`
          );
        } else {
          console.error(
            `Size ${size} not found for product ${product.productName}`
          );
        }
      } catch (error) {
        console.error(
          `Error updating stock for product ${item.product}:`,
          error
        );
      }
    }

    const expectsRedirect =
      req.headers["content-type"] === "application/x-www-form-urlencoded" &&
      !req.xhr &&
      !req.headers["x-requested-with"];

    if (expectsRedirect) {
      return res.redirect(`/order-success/${savedOrder._id}`);
    }

    return res.status(200).json({
      success: true,
      message: "Order placed successfully",
      orderId: savedOrder._id,
      redirectUrl: `/order-success/${savedOrder._id}`,
    });
  } catch (error) {
    console.error("Error placing order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to place order",
    });
  }
};

const orderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const order = await Order.findById(orderId).populate({
      path: "items.product",
      select: "productName productImage regularPrice salePrice",
    });

    if (!order || order.user.toString() !== req.session.user._id) {
      return res.redirect("/profile?tab=orders");
    }

    const user = await User.findById(req.session.user._id);

    res.render("order-success", {
      user: req.session.user,
      order,
      userName: user.firstName || "Valued Customer",
      orderDate: order.createdAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
    });
  } catch (error) {
    console.error("Error loading order success page:", error);
    res.status(500).render("error", {
      error: "Failed to load order success page",
      user: req.session.user,
    });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
  orderSuccess,
};
