const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const { Category } = require("../../models/categorySchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
require("dotenv").config();

const loadVerifyOTP = (req, res) => {
  try {
    if (!req.session.userOtp) {
      return res.redirect("/signup");
    }
    res.render("verifyOTP");
  } catch (error) {
    console.error("Failed to load OTP page:", error);
    res.status(500).render("page-404");
  }
};

const loadHomepage = async (req, res) => {
  try {
    let user = req.session.user;
    const sort = req.query.sort || "alphabetical-asc";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // If user is logged in, fetch complete user data with wishlist and cart
    if (user && user._id) {
      user = await User.findById(user._id)
        .populate("whishlist")
        .populate({
          path: "cart",
          populate: {
            path: "items.product",
          },
        });

      // Set cartCount for the indicator
      if (user.cart && user.cart.items) {
        req.session.user.cartCount = user.cart.items.length;
      } else {
        req.session.user.cartCount = 0;
      }

      req.session.user = user;
    }

    let sortOption;
    switch (sort) {
      case "low-to-high":
        sortOption = { salePrice: 1 };
        break;
      case "high-to-low":
        sortOption = { salePrice: -1 };
        break;
      case "alphabetical-desc":
        sortOption = { productName: -1 };
        break;
      case "alphabetical-asc":
      default:
        sortOption = { productName: 1 };
        break;
    }

    const query = { isListed: true };
    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);
    const totalPages = Math.ceil(total / limit);

    const featuredProducts = await Product.find({
      isListed: true,
      isFeatured: true,
    }).limit(8);

    const newProducts = await Product.find({
      isListed: true,
      isnewproducts: true,
    })
      .sort({ createdAt: -1 })
      .limit(8);

    const categories = await Category.find({ isListed: true }).sort({
      createdAt: -1,
    });

    const barcaproductid = "6822fd826fbe6496d49e9a06";

    return res.render("home", {
      user: user || null,
      products,
      featuredProducts,
      newProducts,
      currentPage: page,
      totalPages,
      sort,
      categories,
      barcaproductid,
    });
  } catch (error) {
    console.error("Home page error:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};

const loadShopAll = async (req, res) => {
  try {
    const user = req.session.user;
    const sort = req.query.sort || "alphabetical-asc";
    const search = req.query.search || "";
    const categoryId = req.query.category || "";
    const subcategory = req.query.subcategory || "";
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : "";
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let sortOption;
    switch (sort) {
      case "low-to-high":
        sortOption = { salePrice: 1, regularPrice: 1 };
        break;
      case "high-to-low":
        sortOption = { salePrice: -1, regularPrice: -1 };
        break;
      case "alphabetical-desc":
        sortOption = { productName: -1 };
        break;
      case "alphabetical-asc":
      default:
        sortOption = { productName: 1 };
        break;
    }

    const categories = await Category.find({ isListed: true }).sort({
      name: 1,
    });

    let selectedCategory = null;
    if (categoryId) {
      selectedCategory = await Category.findById(categoryId);
    }

    const subcategories = selectedCategory
      ? selectedCategory.subcategories
      : [];

    const query = { isListed: true };

    if (categoryId) {
      query.category = categoryId;
    }

    if (subcategory) {
      query.subcategory = subcategory;
    }

    if (minPrice !== "" && maxPrice !== "") {
      query.$or = [
        { salePrice: { $gte: minPrice, $lte: maxPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $gte: minPrice, $lte: maxPrice } },
          ],
        },
      ];
    } else if (minPrice !== "") {
      query.$or = [
        { salePrice: { $gte: minPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $gte: minPrice } },
          ],
        },
      ];
    } else if (maxPrice !== "") {
      query.$or = [
        { salePrice: { $lte: maxPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $lte: maxPrice } },
          ],
        },
      ];
    }

    if (search) {
      if (query.$or) {
        const priceConditions = query.$or;
        query.$or = undefined;

        query.$and = [
          { $or: priceConditions },
          {
            $or: [
              { productName: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          },
        ];
      } else {
        query.$or = [
          { productName: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }
    }

    const total = await Product.countDocuments(query);

    let products;
    if (sort === "low-to-high" || sort === "high-to-low") {
      const priceOrder = sort === "low-to-high" ? 1 : -1;
      products = await Product.aggregate([
        { $match: query },
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            offerPercent: {
              $max: [
                { $ifNull: ["$productOffer", 0] },
                { $ifNull: ["$category.categoryOffer", 0] },
              ],
            },
            effectivePrice: {
              $cond: [
                { $gt: [{ $ifNull: ["$salePrice", null] }, null] },
                "$salePrice",
                {
                  $cond: [
                    { $gt: [{ $ifNull: ["$offerPercent", 0] }, 0] },
                    {
                      $subtract: [
                        "$regularPrice",
                        {
                          $multiply: [
                            "$regularPrice",
                            { $divide: ["$offerPercent", 100] },
                          ],
                        },
                      ],
                    },
                    "$regularPrice",
                  ],
                },
              ],
            },
          },
        },
        { $sort: { effectivePrice: priceOrder } },
        { $skip: skip },
        { $limit: limit },
      ]);
    } else {
      products = await Product.find(query)
        .populate("category", "name")
        .sort(sortOption)
        .skip(skip)
        .limit(limit);
    }

    const totalPages = Math.ceil(total / limit);

    const priceStats = await Product.aggregate([
      { $match: { isListed: true } },
      {
        $group: {
          _id: null,
          minPrice: { $min: { $ifNull: ["$salePrice", "$regularPrice"] } },
          maxPrice: { $max: "$regularPrice" },
        },
      },
    ]);

    const priceRange =
      priceStats.length > 0
        ? {
            min: Math.floor(priceStats[0].minPrice),
            max: Math.ceil(priceStats[0].maxPrice),
          }
        : { min: 0, max: 1000 };

    let searchMessage = "";
    if (search && products.length === 0) {
      searchMessage = `No products found matching "${search}". Try a different search term.`;
    } else if (search && products.length > 0) {
      searchMessage = `Showing results for "${search}"`;
    }

    let filterMessage = "";
    if (categoryId || subcategory || minPrice !== "" || maxPrice !== "") {
      filterMessage = "Filtered results";

      if (categoryId) {
        const category = categories.find(
          (cat) => cat._id.toString() === categoryId
        );
        if (category) {
          filterMessage += ` for category "${category.name}"`;

          if (subcategory) {
            filterMessage += ` > "${subcategory}"`;
          }
        }
      }

      if (minPrice !== "" && maxPrice !== "") {
        filterMessage += ` with price between $${minPrice} and $${maxPrice}`;
      } else if (minPrice !== "") {
        filterMessage += ` with price from $${minPrice}`;
      } else if (maxPrice !== "") {
        filterMessage += ` with price up to $${maxPrice}`;
      }
    }

    return res.render("shopall", {
      user: user || null,
      products,
      categories,
      subcategories,
      currentPage: page,
      totalPages,
      sort,
      search,
      searchMessage,
      filterMessage,
      categoryId,
      subcategory,
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      priceRange,
    });
  } catch (error) {
    console.error("Home page error:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};

const loadLogin = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.render("login", { message: null });
    }
    return res.redirect("/");
  } catch (error) {
    console.error("Login page error:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};

const loadSignUp = async (req, res) => {
  try {
    return res.render("signup", { message: null });
  } catch (error) {
    console.error("Signup page error:", error);
    res.status(500).render("page-500", { message: "Server Error" });
  }
};

const loadPageNotFound = (req, res) => {
  try {
    res.status(404).render("page-404");
  } catch (error) {
    console.error("Page not found error:", error);
    res.status(500).render("page-500", { message: "Server Error" });
  }
};

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const generateReferralCode = (name, email) => {
  const namePrefix = name.substring(0, 3).toUpperCase();
  const randomChars = Math.random().toString(36).substring(2, 7).toUpperCase();
  const timestamp = Date.now().toString().slice(-4);
  return `${namePrefix}${randomChars}${timestamp}`;
};

const processReferralReward = async (referrerId, newUserId) => {
  try {
    const referrer = await User.findById(referrerId);
    const newUser = await User.findById(newUserId);

    if (!referrer || !newUser) return;

    const newUserReward = 35;
    newUser.wallet += newUserReward;

    const newUserTransaction = new WalletTransaction({
      user: newUserId,
      amount: newUserReward,
      type: "credit",
      description: "Referral bonus for joining with a referral code",
    });

    const referrerReward = newUserReward * 2;
    referrer.wallet += referrerReward;

    referrer.redeemedUsers.push(newUserId);

    const referrerTransaction = new WalletTransaction({
      user: referrerId,
      amount: referrerReward,
      type: "credit",
      description: `Referral reward for inviting ${newUser.name}`,
    });

    await Promise.all([
      newUser.save(),
      referrer.save(),
      newUserTransaction.save(),
      referrerTransaction.save(),
    ]);

    await User.findByIdAndUpdate(newUserId, {
      $push: {
        notifications: {
          message: `You received ₹${newUserReward} in your wallet as a referral bonus!`,
          type: "wallet",
        },
      },
    });

    await User.findByIdAndUpdate(referrerId, {
      $push: {
        notifications: {
          message: `You received ₹${referrerReward} in your wallet for referring ${newUser.name}!`,
          type: "wallet",
        },
      },
    });
  } catch (error) {
    console.error("Error processing referral reward:", error);
  }
};

async function sendVerification({ email, otp }) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify Your Email",
      html: `<p>Your OTP is <b>${otp}</b></p>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

const signup = async (req, res) => {
  try {
    const { name, email, password, cPassword, referalCode } = req.body;

    if (password !== cPassword) {
      return res.render("signup", { message: "Passwords do not match" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render("signup", { message: "User already exists" });
    }

    let referrerId = null;
    if (referalCode) {
      const referrer = await User.findOne({ referalCode });
      if (!referrer) {
        return res.render("signup", { message: "Invalid referral code" });
      }
      referrerId = referrer._id;
    }

    const otp = generateOtp();
    const emailSent = await sendVerification({ email, otp });
    console.log("otp sent: ", otp);

    if (!emailSent) {
      return res.render("signup", {
        message: "Failed to send OTP. Try again.",
      });
    }

    req.session.userOtp = otp;
    req.session.otpTimestamp = Date.now();
    req.session.userData = { name, email, password, referrerId };

    return res.redirect("/verifyOTP");
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).render("page-500", { message: "Server Error" });
  }
};

const verifyOTP = async (req, res) => {
  try {
    if (!req.session.userData || !req.session.userOtp) {
      req.session.userOtp = null;
      req.session.userData = null;
      req.session.otpTimestamp = null;
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Session expired or invalid. Please start the process again.",
        });
    }

    const otpTimestamp = req.session.otpTimestamp;
    if (Date.now() - otpTimestamp > 10 * 60 * 1000) {
      req.session.userOtp = null;
      req.session.userData = null;
      req.session.otpTimestamp = null;
      return res.json({
        success: false,
        message: "OTP expired. Please request a new OTP.",
      });
    }

    const { digit1, digit2, digit3, digit4, digit5, digit6 } = req.body;
    const enteredOtp = `${digit1}${digit2}${digit3}${digit4}${digit5}${digit6}`;

    if (enteredOtp === req.session.userOtp) {
      const { name, email, password, referrerId } = req.session.userData;
      const hashedPassword = await bcrypt.hash(password, 10);

      // Generate a unique referral code
      const referalCode = generateReferralCode(name, email);

      const newUser = new User({
        name,
        email,
        password: hashedPassword,
        verified: true,
        referalCode,
        referredBy: referrerId,
      });

      await newUser.save();

      // Handle referral rewards if user was referred
      if (referrerId) {
        await processReferralReward(referrerId, newUser._id);
      }

      req.session.user = {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        verified: newUser.verified,
        referalCode: newUser.referalCode,
      };

      req.session.userOtp = null;
      req.session.userData = null;
      req.session.otpTimestamp = null;

      return res.json({ success: true, redirect: "/" });
    } else {
      return res.json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const resendOTP = async (req, res) => {
  try {
    if (!req.session.userData) {
      return res.json({
        success: false,
        message: "Session expired. Please sign up again.",
      });
    }

    const { email } = req.session.userData;

    if (Date.now() - req.session.otpTimestamp > 10 * 60 * 1000) {
      req.session.userOtp = null;
      req.session.userData = null;
      req.session.otpTimestamp = null;
      return res.json({
        success: false,
        message: "OTP expired. Please request a new OTP.",
      });
    }

    const otp = generateOtp();
    console.log("Resend OTP:", otp);
    const emailSent = await sendVerification({ email, otp });

    if (emailSent) {
      req.session.userOtp = otp;
      return res.json({ success: true, message: "New OTP sent successfully!" });
    } else {
      return res.json({ success: false, message: "Failed to resend OTP." });
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const findUser = await User.findOne({ isAdmin: 0, email: email });

    if (!findUser) {
      return res.render("login", { message: "User does not exist" });
    }
    if (findUser.isBlocked) {
      return res.render("login", { message: "User is blocked by admin" });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);
    if (!passwordMatch) {
      return res.render("login", { message: "Incorrect password" });
    }

    req.session.user = {
      _id: findUser._id,
      name: findUser.name,
      email: findUser.email,
      verified: findUser.verified,
    };

    res.redirect("/");
  } catch (error) {
    console.error("Login error:", error);
    res.render("login", { message: "Login failed. Please try again later." });
  }
};

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err.message);
        return res.status(500).render("page-404", { message: "Server Error" });
      }
      return res.redirect("/login");
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).render("page-500", { message: "Server Error" });
  }
};

const loadProductDetail = async (req, res) => {
  try {
    const user = req.session.user;
    const productId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res
        .status(404)
        .render("page-404", { message: "Invalid product ID" });
    }

    // Fetch product with populated category to access category offer
    const product = await Product.findOne({
      _id: productId,
      isListed: true,
    }).populate("category");

    if (!product) {
      return res
        .status(404)
        .render("page-404", { message: "Product not found" });
    }

    // Calculate total stock
    let totalStock = 0;
    if (product.sizes && product.sizes.length > 0) {
      product.sizes.forEach((size) => {
        totalStock += size.quantity || 0;
      });
    }

    // Handle offers
    let appliedOffer = 0;
    let offerType = null;

    // Check if product has an offer
    if (product.productOffer && product.productOffer > 0) {
      appliedOffer = product.productOffer;
      offerType = "product";
    }

    // Check if category has an offer
    if (
      product.category &&
      product.category.categoryOffer &&
      product.category.categoryOffer > 0
    ) {
      // Apply the larger offer between product and category
      if (product.category.categoryOffer > appliedOffer) {
        appliedOffer = product.category.categoryOffer;
        offerType = "category";
      }
    }

    // Find related products
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isListed: true,
    }).limit(4);

    return res.render("productDetail", {
      user: user || null,
      product,
      totalStock,
      relatedProducts,
      appliedOffer,
      offerType,
    });
  } catch (error) {
    console.error("Product detail page error:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};

const loadFootball = async (req, res) => {
  try {
    const user = req.session.user;
    const sort = req.query.sort || "alphabetical-asc";
    const search = req.query.search || "";
    const subcategory = req.query.subcategory || "";
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : "";
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let sortOption;
    switch (sort) {
      case "low-to-high":
        sortOption = { salePrice: 1, regularPrice: 1 };
        break;
      case "high-to-low":
        sortOption = { salePrice: -1, regularPrice: -1 };
        break;
      case "alphabetical-desc":
        sortOption = { productName: -1 };
        break;
      case "alphabetical-asc":
      default:
        sortOption = { productName: 1 };
        break;
    }

    const categories = await Category.find({ isListed: true }).sort({
      name: 1,
    });

    const footballCategory = await Category.findOne({
      name: { $regex: new RegExp("^football$", "i") },
      isListed: true,
    });

    if (!footballCategory) {
      return res
        .status(404)
        .render("page-404", { message: "Football category not found" });
    }

    const categoryId = footballCategory._id.toString();

    const subcategories = footballCategory.subcategories || [];

    const query = { isListed: true, category: categoryId };

    if (subcategory) {
      query.subcategory = subcategory;
    }

    if (minPrice !== "" && maxPrice !== "") {
      query.$or = [
        { salePrice: { $gte: minPrice, $lte: maxPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $gte: minPrice, $lte: maxPrice } },
          ],
        },
      ];
    } else if (minPrice !== "") {
      query.$or = [
        { salePrice: { $gte: minPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $gte: minPrice } },
          ],
        },
      ];
    } else if (maxPrice !== "") {
      query.$or = [
        { salePrice: { $lte: maxPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $lte: maxPrice } },
          ],
        },
      ];
    }

    if (search) {
      if (query.$or) {
        const priceConditions = query.$or;
        query.$or = undefined;

        query.$and = [
          { $or: priceConditions },
          {
            $or: [
              { productName: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          },
        ];
      } else {
        query.$or = [
          { productName: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }
    }

    const total = await Product.countDocuments(query);

    let products;
    if (sort === "low-to-high" || sort === "high-to-low") {
      const priceOrder = sort === "low-to-high" ? 1 : -1;
      products = await Product.aggregate([
        { $match: query },
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            offerPercent: {
              $max: [
                { $ifNull: ["$productOffer", 0] },
                { $ifNull: ["$category.categoryOffer", 0] },
              ],
            },
            effectivePrice: {
              $cond: [
                { $gt: [{ $ifNull: ["$salePrice", null] }, null] },
                "$salePrice",
                {
                  $cond: [
                    { $gt: [{ $ifNull: ["$offerPercent", 0] }, 0] },
                    {
                      $subtract: [
                        "$regularPrice",
                        {
                          $multiply: [
                            "$regularPrice",
                            { $divide: ["$offerPercent", 100] },
                          ],
                        },
                      ],
                    },
                    "$regularPrice",
                  ],
                },
              ],
            },
          },
        },
        { $sort: { effectivePrice: priceOrder } },
        { $skip: skip },
        { $limit: limit },
      ]);
    } else {
      products = await Product.find(query)
        .populate("category", "name")
        .sort(sortOption)
        .skip(skip)
        .limit(limit);
    }

    const totalPages = Math.ceil(total / limit);

    let priceStats = [];
    try {
      priceStats = await Product.aggregate([
        {
          $match: {
            isListed: true,
            category: new mongoose.Types.ObjectId(categoryId),
          },
        },
        {
          $group: {
            _id: null,
            minPrice: { $min: { $ifNull: ["$salePrice", "$regularPrice"] } },
            maxPrice: { $max: "$regularPrice" },
          },
        },
      ]);
    } catch (error) {
      console.error("Error in price aggregation:", error);

      const minPriceProduct = await Product.findOne({
        isListed: true,
        category: categoryId,
      }).sort({ salePrice: 1, regularPrice: 1 });
      const maxPriceProduct = await Product.findOne({
        isListed: true,
        category: categoryId,
      }).sort({ regularPrice: -1 });

      if (minPriceProduct && maxPriceProduct) {
        priceStats = [
          {
            minPrice: minPriceProduct.salePrice || minPriceProduct.regularPrice,
            maxPrice: maxPriceProduct.regularPrice,
          },
        ];
      }
    }

    const priceRange =
      priceStats.length > 0
        ? {
            min: Math.floor(priceStats[0].minPrice),
            max: Math.ceil(priceStats[0].maxPrice),
          }
        : { min: 0, max: 1000 };

    let searchMessage = "";
    if (search && products.length === 0) {
      searchMessage = `No products found matching "${search}". Try a different search term.`;
    } else if (search && products.length > 0) {
      searchMessage = `Showing results for "${search}"`;
    }

    return res.render("football", {
      user: user || null,
      products,
      categories,
      subcategories,
      currentPage: page,
      totalPages,
      sort,
      search,
      searchMessage,
      categoryId,
      subcategory,
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      priceRange,
      category: footballCategory,
    });
  } catch (error) {
    console.error("Football page error:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};

const loadCricket = async (req, res) => {
  try {
    const user = req.session.user;
    const sort = req.query.sort || "alphabetical-asc";
    const search = req.query.search || "";
    const subcategory = req.query.subcategory || "";
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : "";
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let sortOption;
    switch (sort) {
      case "low-to-high":
        sortOption = { salePrice: 1, regularPrice: 1 };
        break;
      case "high-to-low":
        sortOption = { salePrice: -1, regularPrice: -1 };
        break;
      case "alphabetical-desc":
        sortOption = { productName: -1 };
        break;
      case "alphabetical-asc":
      default:
        sortOption = { productName: 1 };
        break;
    }

    const categories = await Category.find({ isListed: true }).sort({
      name: 1,
    });

    const cricketCategory = await Category.findOne({
      name: { $regex: new RegExp("^cricket$", "i") },
      isListed: true,
    });

    if (!cricketCategory) {
      return res
        .status(404)
        .render("page-404", { message: "cricket category not found" });
    }

    const categoryId = cricketCategory._id.toString();

    const subcategories = cricketCategory.subcategories || [];

    const query = { isListed: true, category: categoryId };

    if (subcategory) {
      query.subcategory = subcategory;
    }

    if (minPrice !== "" && maxPrice !== "") {
      query.$or = [
        { salePrice: { $gte: minPrice, $lte: maxPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $gte: minPrice, $lte: maxPrice } },
          ],
        },
      ];
    } else if (minPrice !== "") {
      query.$or = [
        { salePrice: { $gte: minPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $gte: minPrice } },
          ],
        },
      ];
    } else if (maxPrice !== "") {
      query.$or = [
        { salePrice: { $lte: maxPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $lte: maxPrice } },
          ],
        },
      ];
    }

    if (search) {
      if (query.$or) {
        const priceConditions = query.$or;
        query.$or = undefined;

        query.$and = [
          { $or: priceConditions },
          {
            $or: [
              { productName: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          },
        ];
      } else {
        query.$or = [
          { productName: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }
    }

    const total = await Product.countDocuments(query);

    let products;
    if (sort === "low-to-high" || sort === "high-to-low") {
      const priceOrder = sort === "low-to-high" ? 1 : -1;
      products = await Product.aggregate([
        { $match: query },
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            offerPercent: {
              $max: [
                { $ifNull: ["$productOffer", 0] },
                { $ifNull: ["$category.categoryOffer", 0] },
              ],
            },
            effectivePrice: {
              $cond: [
                { $gt: [{ $ifNull: ["$salePrice", null] }, null] },
                "$salePrice",
                {
                  $cond: [
                    { $gt: [{ $ifNull: ["$offerPercent", 0] }, 0] },
                    {
                      $subtract: [
                        "$regularPrice",
                        {
                          $multiply: [
                            "$regularPrice",
                            { $divide: ["$offerPercent", 100] },
                          ],
                        },
                      ],
                    },
                    "$regularPrice",
                  ],
                },
              ],
            },
          },
        },
        { $sort: { effectivePrice: priceOrder } },
        { $skip: skip },
        { $limit: limit },
      ]);
    } else {
      products = await Product.find(query)
        .populate("category", "name")
        .sort(sortOption)
        .skip(skip)
        .limit(limit);
    }

    const totalPages = Math.ceil(total / limit);

    let priceStats = [];
    try {
      priceStats = await Product.aggregate([
        {
          $match: {
            isListed: true,
            category: new mongoose.Types.ObjectId(categoryId),
          },
        },
        {
          $group: {
            _id: null,
            minPrice: { $min: { $ifNull: ["$salePrice", "$regularPrice"] } },
            maxPrice: { $max: "$regularPrice" },
          },
        },
      ]);
    } catch (error) {
      console.error("Error in price aggregation:", error);

      const minPriceProduct = await Product.findOne({
        isListed: true,
        category: categoryId,
      }).sort({ salePrice: 1, regularPrice: 1 });
      const maxPriceProduct = await Product.findOne({
        isListed: true,
        category: categoryId,
      }).sort({ regularPrice: -1 });

      if (minPriceProduct && maxPriceProduct) {
        priceStats = [
          {
            minPrice: minPriceProduct.salePrice || minPriceProduct.regularPrice,
            maxPrice: maxPriceProduct.regularPrice,
          },
        ];
      }
    }

    const priceRange =
      priceStats.length > 0
        ? {
            min: Math.floor(priceStats[0].minPrice),
            max: Math.ceil(priceStats[0].maxPrice),
          }
        : { min: 0, max: 1000 };

    let searchMessage = "";
    if (search && products.length === 0) {
      searchMessage = `No products found matching "${search}". Try a different search term.`;
    } else if (search && products.length > 0) {
      searchMessage = `Showing results for "${search}"`;
    }

    return res.render("cricket", {
      user: user || null,
      products,
      categories,
      subcategories,
      currentPage: page,
      totalPages,
      sort,
      search,
      searchMessage,
      categoryId,
      subcategory,
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      priceRange,
      category: cricketCategory,
    });
  } catch (error) {
    console.error("Cricket page error:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};
const loadBasketball = async (req, res) => {
  try {
    const user = req.session.user;
    const sort = req.query.sort || "alphabetical-asc";
    const search = req.query.search || "";
    const subcategory = req.query.subcategory || "";
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : "";
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let sortOption;
    switch (sort) {
      case "low-to-high":
        sortOption = { salePrice: 1, regularPrice: 1 };
        break;
      case "high-to-low":
        sortOption = { salePrice: -1, regularPrice: -1 };
        break;
      case "alphabetical-desc":
        sortOption = { productName: -1 };
        break;
      case "alphabetical-asc":
      default:
        sortOption = { productName: 1 };
        break;
    }

    const categories = await Category.find({ isListed: true }).sort({
      name: 1,
    });

    const basketballCategory = await Category.findOne({
      name: { $regex: new RegExp("^basketball$", "i") },
      isListed: true,
    });

    if (!basketballCategory) {
      return res
        .status(404)
        .render("page-404", { message: "basketball category not found" });
    }

    const categoryId = basketballCategory._id.toString();

    const subcategories = basketballCategory.subcategories || [];

    const query = { isListed: true, category: categoryId };

    if (subcategory) {
      query.subcategory = subcategory;
    }

    if (minPrice !== "" && maxPrice !== "") {
      query.$or = [
        { salePrice: { $gte: minPrice, $lte: maxPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $gte: minPrice, $lte: maxPrice } },
          ],
        },
      ];
    } else if (minPrice !== "") {
      query.$or = [
        { salePrice: { $gte: minPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $gte: minPrice } },
          ],
        },
      ];
    } else if (maxPrice !== "") {
      query.$or = [
        { salePrice: { $lte: maxPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $lte: maxPrice } },
          ],
        },
      ];
    }

    if (search) {
      if (query.$or) {
        const priceConditions = query.$or;
        query.$or = undefined;

        query.$and = [
          { $or: priceConditions },
          {
            $or: [
              { productName: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          },
        ];
      } else {
        query.$or = [
          { productName: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }
    }

    const total = await Product.countDocuments(query);

    let products;
    if (sort === "low-to-high" || sort === "high-to-low") {
      const priceOrder = sort === "low-to-high" ? 1 : -1;
      products = await Product.aggregate([
        { $match: query },
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            offerPercent: {
              $max: [
                { $ifNull: ["$productOffer", 0] },
                { $ifNull: ["$category.categoryOffer", 0] },
              ],
            },
            effectivePrice: {
              $cond: [
                { $gt: [{ $ifNull: ["$salePrice", null] }, null] },
                "$salePrice",
                {
                  $cond: [
                    { $gt: [{ $ifNull: ["$offerPercent", 0] }, 0] },
                    {
                      $subtract: [
                        "$regularPrice",
                        {
                          $multiply: [
                            "$regularPrice",
                            { $divide: ["$offerPercent", 100] },
                          ],
                        },
                      ],
                    },
                    "$regularPrice",
                  ],
                },
              ],
            },
          },
        },
        { $sort: { effectivePrice: priceOrder } },
        { $skip: skip },
        { $limit: limit },
      ]);
    } else {
      products = await Product.find(query)
        .populate("category", "name")
        .sort(sortOption)
        .skip(skip)
        .limit(limit);
    }

    const totalPages = Math.ceil(total / limit);

    let priceStats = [];
    try {
      priceStats = await Product.aggregate([
        {
          $match: {
            isListed: true,
            category: new mongoose.Types.ObjectId(categoryId),
          },
        },
        {
          $group: {
            _id: null,
            minPrice: { $min: { $ifNull: ["$salePrice", "$regularPrice"] } },
            maxPrice: { $max: "$regularPrice" },
          },
        },
      ]);
    } catch (error) {
      console.error("Error in price aggregation:", error);

      const minPriceProduct = await Product.findOne({
        isListed: true,
        category: categoryId,
      }).sort({ salePrice: 1, regularPrice: 1 });
      const maxPriceProduct = await Product.findOne({
        isListed: true,
        category: categoryId,
      }).sort({ regularPrice: -1 });

      if (minPriceProduct && maxPriceProduct) {
        priceStats = [
          {
            minPrice: minPriceProduct.salePrice || minPriceProduct.regularPrice,
            maxPrice: maxPriceProduct.regularPrice,
          },
        ];
      }
    }

    const priceRange =
      priceStats.length > 0
        ? {
            min: Math.floor(priceStats[0].minPrice),
            max: Math.ceil(priceStats[0].maxPrice),
          }
        : { min: 0, max: 1000 };

    let searchMessage = "";
    if (search && products.length === 0) {
      searchMessage = `No products found matching "${search}". Try a different search term.`;
    } else if (search && products.length > 0) {
      searchMessage = `Showing results for "${search}"`;
    }

    return res.render("basketball", {
      user: user || null,
      products,
      categories,
      subcategories,
      currentPage: page,
      totalPages,
      sort,
      search,
      searchMessage,
      categoryId,
      subcategory,
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      priceRange,
      category: basketballCategory,
    });
  } catch (error) {
    console.error("basketballpage error:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};

const loadForgotPassword = (req, res) => {
  try {
    res.render("forgot-password", { error: null, success: null });
  } catch (error) {
    console.error("Error loading forgot password page:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};

const sendResetOTP = async (req, res) => {
  try {
    console.log("=== Send Reset OTP Debug Info ===");
    console.log("1. Raw Request Body:", req.body);

    let email = "";
    try {
      email = String(req.body.email || "")
        .trim()
        .toLowerCase();
    } catch (err) {
      console.error("Error normalizing email:", err);
      return res.render("forgot-password", {
        error: "Invalid email format",
        success: null,
      });
    }

    console.log("2. Normalized Email:", email);

    if (!email) {
      return res.render("forgot-password", {
        error: "Email is required",
        success: null,
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.render("forgot-password", {
        error: "No account found with that email address",
        success: null,
      });
    }

    if (user.googleId && !user.password) {
      return res.render("forgot-password", {
        error:
          "This account uses Google authentication. Please sign in with Google.",
        success: null,
      });
    }

    const otp = generateOtp();
    console.log("3. Generated OTP:", otp);

    req.session.resetPasswordOtp = {
      email,
      otp: String(otp),
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log("4. Session Data:", req.session.resetPasswordOtp);

    await sendVerification({ email, otp: String(otp) });

    res.render("reset-password-otp", {
      email,
      error: null,
    });
  } catch (error) {
    console.error("Error sending reset OTP:", error);
    res.render("forgot-password", {
      error: "An error occurred while sending the OTP. Please try again.",
      success: null,
    });
  }
};

const loadResetPasswordOTP = (req, res) => {
  try {
    if (!req.session.resetPasswordOtp) {
      return res.redirect("/forgot-password");
    }

    res.render("reset-password-otp", {
      email: req.session.resetPasswordOtp.email,
      error: null,
    });
  } catch (error) {
    console.error("Error loading reset password OTP page:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};

const verifyResetOTP = async (req, res) => {
  try {
    console.log("=== OTP Verification Debug Info ===");
    console.log("1. Raw Request Body:", JSON.stringify(req.body));

    const rawEmail = req.body.email;
    const rawOtp = req.body.otp;

    console.log("2. Raw Values:");
    console.log("   Email:", rawEmail);
    console.log("   OTP:", rawOtp);

    if (!rawEmail || !rawOtp) {
      return res.render("reset-password-otp", {
        email: rawEmail || "",
        error: "Email and OTP are required.",
      });
    }

    let email, otp;
    try {
      email = String(rawEmail).trim().toLowerCase();
      otp = String(rawOtp).trim();
    } catch (err) {
      console.error("Error converting input to string:", err);
      return res.render("reset-password-otp", {
        email: rawEmail || "",
        error: "Invalid input format",
      });
    }

    console.log("3. Normalized Values:");
    console.log("   Email:", email);
    console.log("   OTP:", otp);

    console.log("4. Session State:");
    console.log("   Full Session:", req.session);
    console.log("   Reset Password OTP:", req.session.resetPasswordOtp);

    if (!req.session.resetPasswordOtp) {
      return res.render("reset-password-otp", {
        email,
        error: "OTP session expired. Please request a new OTP.",
      });
    }

    const sessionEmail = req.session.resetPasswordOtp.email;
    const sessionOtp = req.session.resetPasswordOtp.otp;

    console.log("5. Session Values:");
    console.log("   Session Email:", sessionEmail);
    console.log("   Session OTP:", sessionOtp);

    let normalizedSessionEmail, normalizedSessionOtp;
    try {
      normalizedSessionEmail = String(sessionEmail).trim().toLowerCase();
      normalizedSessionOtp = String(sessionOtp).trim();
    } catch (err) {
      console.error("Error normalizing session data:", err);
      return res.render("reset-password-otp", {
        email,
        error: "Session data is invalid. Please request a new OTP.",
      });
    }

    console.log("6. Comparison:");
    console.log("   Normalized Session Email:", normalizedSessionEmail);
    console.log("   Normalized Input Email:", email);
    console.log("   Normalized Session OTP:", normalizedSessionOtp);
    console.log("   Normalized Input OTP:", otp);

    if (normalizedSessionEmail !== email) {
      console.log(" Email Mismatch");
      return res.render("reset-password-otp", {
        email,
        error: "Email mismatch. Please request a new OTP.",
      });
    }

    if (Date.now() > req.session.resetPasswordOtp.expiresAt) {
      console.log(" OTP Expired");
      console.log("   Current Time:", Date.now());
      console.log("   Expiry Time:", req.session.resetPasswordOtp.expiresAt);
      return res.render("reset-password-otp", {
        email,
        error: "OTP has expired. Please request a new OTP.",
      });
    }

    if (normalizedSessionOtp !== otp) {
      console.log(" OTP Mismatch");
      return res.render("reset-password-otp", {
        email,
        error: "Invalid OTP. Please try again.",
      });
    }

    console.log(" Verification Successful");

    const token = require("crypto").randomBytes(32).toString("hex");

    req.session.resetPasswordToken = {
      email,
      token,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };

    delete req.session.resetPasswordOtp;

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.render("reset-password", {
      email,
      token,
      error: null,
    });
  } catch (error) {
    console.error("Error verifying reset OTP:", error);
    res.render("reset-password-otp", {
      email: req.body.email,
      error: "An error occurred while verifying the OTP. Please try again.",
    });
  }
};

const resendResetOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.render("forgot-password", {
        error: "No account found with that email address",
        success: null,
      });
    }

    const otp = generateOtp();

    req.session.resetPasswordOtp = {
      email,
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    await sendVerification({ email, otp });

    res.render("reset-password-otp", {
      email,
      error: "A new OTP has been sent to your email address.",
    });
  } catch (error) {
    console.error("Error resending reset OTP:", error);
    res.render("reset-password-otp", {
      email: req.body.email,
      error: "An error occurred while resending the OTP. Please try again.",
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword, confirmPassword } = req.body;

    if (!req.session.resetPasswordToken) {
      return res.render("reset-password", {
        email,
        token,
        error: "Password reset session expired. Please request a new OTP.",
      });
    }

    if (
      req.session.resetPasswordToken.email !== email ||
      req.session.resetPasswordToken.token !== token
    ) {
      return res.render("reset-password", {
        email,
        token,
        error: "Invalid reset request. Please request a new OTP.",
      });
    }

    if (Date.now() > req.session.resetPasswordToken.expiresAt) {
      return res.render("reset-password", {
        email,
        token,
        error: "Reset token has expired. Please request a new OTP.",
      });
    }

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.render("reset-password", {
        email,
        token,
        error:
          "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.render("reset-password", {
        email,
        token,
        error: "Passwords do not match",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.render("reset-password", {
        email,
        token,
        error: "User not found. Please request a new OTP.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.findByIdAndUpdate(user._id, { password: hashedPassword });

    delete req.session.resetPasswordOtp;
    delete req.session.resetPasswordToken;

    res.render("login", {
      message:
        "Password has been reset successfully. Please login with your new password.",
      error_msg: null,
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.render("reset-password", {
      email: req.body.email,
      token: req.body.token,
      error:
        "An error occurred while resetting your password. Please try again.",
    });
  }
};

module.exports = {
  loadHomepage,
  loadLogin,
  loadSignUp,
  loadForgotPassword,
  sendResetOTP,
  loadResetPasswordOTP,
  verifyResetOTP,
  resendResetOTP,
  resetPassword,
  loadVerifyOTP,
  loadPageNotFound,
  signup,
  verifyOTP,
  resendOTP,
  login,
  logout,
  loadProductDetail,
  loadShopAll,
  loadFootball,
  loadCricket,
  loadBasketball,
};
