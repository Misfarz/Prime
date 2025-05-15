const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const User = require("../../models/userSchema");
const {Product} = require('../../models/productSchema')
const {Category} = require('../../models/categorySchema')
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
        const user = req.session.user;
        const sort = req.query.sort || 'alphabetical-asc';
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        let sortOption;
        switch (sort) {
            case 'low-to-high':
                sortOption = { salePrice: 1, regularPrice: 1 };
                break;
            case 'high-to-low':
                sortOption = { salePrice: -1, regularPrice: -1 };
                break;
            case 'alphabetical-desc':
                sortOption = { productName: -1 };
                break;
            case 'alphabetical-asc':
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

     
        const featuredProducts = await Product.find({ isListed: true, isFeatured: true })
            .limit(8);

  
        const newProducts = await Product.find({ isListed: true, isNew: true })
            .sort({ createdAt: -1 })
            .limit(8);

        const categories = await Category.find({isListed:true}).sort({createdAt:-1})
        

        return res.render('home', {
            user: user || null,
            products,
            featuredProducts,
            newProducts,
            currentPage: page,
            totalPages,
            sort,
            categories
        });
    } catch (error) {
        console.error("Home page error:", error);
        res.status(500).render("page-404", { message: "Server Error" });
    }
};

const loadShopAll = async (req, res) => {
    try {
        const user = req.session.user;
        const sort = req.query.sort || 'alphabetical-asc';
        const search = req.query.search || '';
        const categoryId = req.query.category || '';
        const subcategory = req.query.subcategory || '';
        const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : '';
        const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : '';
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        let sortOption;
        switch (sort) {
            case 'low-to-high':
                sortOption = { salePrice: 1, regularPrice: 1 };
                break;
            case 'high-to-low':
                sortOption = { salePrice: -1, regularPrice: -1 };
                break;
            case 'alphabetical-desc':
                sortOption = { productName: -1 };
                break;
            case 'alphabetical-asc':
            default:
                sortOption = { productName: 1 };
                break;
        }

        const categories = await Category.find({ isListed: true }).sort({ name: 1 });
        
        // Get the selected category to access its subcategories
        let selectedCategory = null;
        if (categoryId) {
            selectedCategory = await Category.findById(categoryId);
        }
        
        // Get all subcategories for the selected category
        const subcategories = selectedCategory ? selectedCategory.subcategories : [];
    
        const query = { isListed: true };
        
        // Add category filter if selected
        if (categoryId) {
            query.category = categoryId;
        }
        
        // Add subcategory filter if selected
        if (subcategory) {
            query.subcategory = subcategory;
        }
        
        // Add price range filter if provided
        if (minPrice !== '' && maxPrice !== '') {
            query.$or = [
                { salePrice: { $gte: minPrice, $lte: maxPrice } },
                { 
                    $and: [
                        { salePrice: { $exists: false } },
                        { regularPrice: { $gte: minPrice, $lte: maxPrice } }
                    ]
                }
            ];
        } else if (minPrice !== '') {
            query.$or = [
                { salePrice: { $gte: minPrice } },
                { 
                    $and: [
                        { salePrice: { $exists: false } },
                        { regularPrice: { $gte: minPrice } }
                    ]
                }
            ];
        } else if (maxPrice !== '') {
            query.$or = [
                { salePrice: { $lte: maxPrice } },
                { 
                    $and: [
                        { salePrice: { $exists: false } },
                        { regularPrice: { $lte: maxPrice } }
                    ]
                }
            ];
        }
      
        // Add search filter if provided
        if (search) {
            // If we already have $or for price filtering, we need to use $and to combine with search
            if (query.$or) {
                const priceConditions = query.$or;
                query.$or = undefined; // Remove the existing $or
                
                query.$and = [
                    { $or: priceConditions },
                    { $or: [
                        { productName: { $regex: search, $options: 'i' } }, 
                        { description: { $regex: search, $options: 'i' } }
                    ]}
                ];
            } else {
                query.$or = [
                    { productName: { $regex: search, $options: 'i' } }, 
                    { description: { $regex: search, $options: 'i' } }
                ];
            }
        }

        const total = await Product.countDocuments(query);
        
        const products = await Product.find(query)
            .populate('category', 'name')
            .sort(sortOption)
            .skip(skip)
            .limit(limit);
            
        const totalPages = Math.ceil(total / limit);

        // Get min and max prices for the price range filter
        const priceStats = await Product.aggregate([
            { $match: { isListed: true } },
            { $group: {
                _id: null,
                minPrice: { $min: { $ifNull: ['$salePrice', '$regularPrice'] } },
                maxPrice: { $max: '$regularPrice' }
            }}
        ]);
        
        const priceRange = priceStats.length > 0 ? {
            min: Math.floor(priceStats[0].minPrice),
            max: Math.ceil(priceStats[0].maxPrice)
        } : { min: 0, max: 1000 };
     
        let searchMessage = '';
        if (search && products.length === 0) {
            searchMessage = `No products found matching "${search}". Try a different search term.`;
        } else if (search && products.length > 0) {
            searchMessage = `Showing results for "${search}"`;
        }

        // Add filter message
        let filterMessage = '';
        if (categoryId || subcategory || minPrice !== '' || maxPrice !== '') {
            filterMessage = 'Filtered results';
            
            if (categoryId) {
                const category = categories.find(cat => cat._id.toString() === categoryId);
                if (category) {
                    filterMessage += ` for category "${category.name}"`;
                    
                    if (subcategory) {
                        filterMessage += ` > "${subcategory}"`;
                    }
                }
            }
            
            if (minPrice !== '' && maxPrice !== '') {
                filterMessage += ` with price between $${minPrice} and $${maxPrice}`;
            } else if (minPrice !== '') {
                filterMessage += ` with price from $${minPrice}`;
            } else if (maxPrice !== '') {
                filterMessage += ` with price up to $${maxPrice}`;
            }
        }

        return res.render('shopall', {
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
            minPrice: minPrice || '',
            maxPrice: maxPrice || '',
            priceRange
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
        return res.redirect('/');
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

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

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
        const { name, email, password, cPassword } = req.body;

        if (password !== cPassword) {
            return res.render("signup", { message: "Passwords do not match" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render("signup", { message: "User already exists" });
        }

        const otp = generateOtp();
        const emailSent = await sendVerification({ email, otp });

        if (!emailSent) {
            return res.render("signup", { message: "Failed to send OTP. Try again." });
        }

        req.session.userOtp = otp;
        req.session.otpTimestamp = Date.now();
        req.session.userData = { name, email, password };

        console.log("OTP Sent:", otp);
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
            return res.status(400).json({ success: false, message: "Session expired or invalid. Please start the process again." });
        }

        const otpTimestamp = req.session.otpTimestamp;
        if (Date.now() - otpTimestamp > 10 * 60 * 1000) {
            req.session.userOtp = null;
            req.session.userData = null;
            req.session.otpTimestamp = null;
            return res.json({ success: false, message: "OTP expired. Please request a new OTP." });
        }

        const { digit1, digit2, digit3, digit4, digit5, digit6 } = req.body;
        const enteredOtp = `${digit1}${digit2}${digit3}${digit4}${digit5}${digit6}`;

        if (enteredOtp === req.session.userOtp) {
            const { name, email, password } = req.session.userData;
            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = new User({
                name,
                email,
                password: hashedPassword,
                verified: true,
            });

            await newUser.save();

       
            req.session.user = {
                _id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                verified: newUser.verified
            };

         
            req.session.userOtp = null;
            req.session.userData = null;
            req.session.otpTimestamp = null;

            return res.json({ success: true, redirect: '/' });
        } else {
            return res.json({ success: false, message: "Invalid OTP. Please try again." });
        }
    } catch (error) {
        console.error("OTP verification error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const resendOTP = async (req, res) => {
    try {
        if (!req.session.userData) {
            return res.json({ success: false, message: "Session expired. Please sign up again." });
        }

        const { email } = req.session.userData;

        if (Date.now() - req.session.otpTimestamp > 10 * 60 * 1000) {
            req.session.userOtp = null;
            req.session.userData = null;
            req.session.otpTimestamp = null;
            return res.json({ success: false, message: "OTP expired. Please request a new OTP." });
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
            return res.render('login', { message: "User does not exist" });
        }
        if (findUser.isBlocked) {
            return res.render('login', { message: "User is blocked by admin" });
        }


 const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) {
            return res.render('login', { message: "Incorrect password" });
        }

        req.session.user = {
            _id: findUser._id,
            name: findUser.name,
            email: findUser.email,
            verified: findUser.verified
        };

        res.redirect('/');
    } catch (error) {
        console.error("Login error:", error);
        res.render('login', { message: "Login failed. Please try again later." });
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.error("Session destroy error:", err.message);
                return res.status(500).render('page-404', { message: "Server Error" });
            }
            return res.redirect("/login");
        });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).render('page-500', { message: "Server Error" });
    }
};

const loadProductDetail = async (req, res) => {
    try {
        const user = req.session.user;
        const productId = req.params.id;
        
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(404).render('page-404', { message: 'Invalid product ID' });
        }
        
     
        const product = await Product.findOne({ _id: productId, isListed: true }).populate('category');
        
        if (!product) {
            return res.status(404).render('page-404', { message: 'Product not found' });
        }
        
   
        let totalStock = 0;
        if (product.sizes && product.sizes.length > 0) {
            product.sizes.forEach(size => {
                totalStock += size.quantity || 0;
            });
        }
        
   
        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: product._id },
            isListed: true
        }).limit(4);
        
        return res.render('productDetail', {
            user: user || null,
            product,
            totalStock,
            relatedProducts
        });
    } catch (error) {
        console.error('Product detail page error:', error);
        res.status(500).render('page-404', { message: 'Server Error' });
    }
};

module.exports = {
    loadHomepage,
    loadLogin,
    loadSignUp,
    loadVerifyOTP,
    loadPageNotFound,
    loadShopAll,
    loadProductDetail,
    signup,
    login,
    verifyOTP,
    resendOTP,
    logout
};