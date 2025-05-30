const express = require('express');
const router = express.Router();
const userController = require("../controllers/user/userController");
const profileController = require("../controllers/user/profileController");
const wishlistController = require("../controllers/user/wishlistController");
const cartController = require("../controllers/user/cartController");
const checkoutController = require('../controllers/user/checkoutController');
const orderController = require('../controllers/user/orderController');
const couponController = require('../controllers/user/couponController');
const { userAuth } = require('../middleware/auth');
const passport = require('passport');
const multer = require('multer');
const path = require('path');
const fs = require('fs');


const profileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'public/uploads/profiles';
   
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
   
    const userId = req.session.user?._id || 'unknown';
    cb(null, userId + '-' + Date.now() + path.extname(file.originalname));
  }
});


const imageFilter = function (req, file, cb) {
  
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg'];
  const allowedExtensions = /\.(jpg|jpeg|png|gif)$/i;
  
  console.log('File upload attempt:', { 
    originalname: file.originalname, 
    mimetype: file.mimetype 
  });
  
  if (!allowedMimeTypes.includes(file.mimetype) || !file.originalname.match(allowedExtensions)) {
    console.log('File rejected: not an allowed image type');
    return cb(new Error('Only image files (JPG, JPEG, PNG, GIF) are allowed!'), false);
  }
  
  console.log('File accepted as valid image');
  cb(null, true);
};

const uploadProfileImage = multer({ 
  storage: profileStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
}).single('profileImage');

const handleProfileImageUpload = (req, res, next) => {
  uploadProfileImage(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).render('edit-profile', { 
          user: req.session.user,
          error: 'File too large. Maximum size is 5MB.'
        });
      }
      return res.status(400).render('edit-profile', { 
        user: req.session.user,
        error: `Upload error: ${err.message}`
      });
    } else if (err) {
      console.error('Non-multer error:', err);
      return res.status(400).render('edit-profile', { 
        user: req.session.user,
        error: err.message
      });
    }
    next();
  });
};


router.get('/', userController.loadHomepage);
router.get('/login', userController.loadLogin);

  router.get('/signup', userController.loadSignUp);
  router.get('/verifyOTP', userController.loadVerifyOTP); 
  router.get('/pageNotFound', userController.loadPageNotFound);
  router.get('/shopall', userController.loadShopAll);
  router.get('/product/:id', userController.loadProductDetail);
  router.get('/football', userController.loadFootball);
  router.get('/cricket',userController.loadCricket)
router.get('/basketball', userController.loadBasketball)
// router.get('/NewArrivals',userController.loadNewArrivals)


router.get('/wishlist', userAuth, wishlistController.loadWishlist);
router.post('/wishlist/add/:productId', userAuth, wishlistController.addToWishlist);
router.delete('/wishlist/remove/:productId', userAuth, wishlistController.removeFromWishlist);
router.get('/wishlist/check/:productId', wishlistController.checkWishlistStatus);


router.get('/cart', userAuth, cartController.loadCart);
router.get('/cart/debug', userAuth, cartController.debugCart);
router.post('/cart/add', userAuth, cartController.addToCart);
router.post('/cart/update-quantity', userAuth, cartController.updateCartItemQuantity);
router.delete('/cart/remove/:itemId', userAuth, cartController.removeFromCart);
router.delete('/cart/clear', userAuth, cartController.clearCart);
router.post('/cart/validate-checkout', userAuth, cartController.validateCartForCheckout);


router.get('/checkout', userAuth, checkoutController.loadCheckout);
router.post('/checkout/place-order', userAuth, checkoutController.placeOrder);
router.get('/order-success/:orderId', userAuth, checkoutController.orderSuccess);

// Coupon routes
router.post('/coupons/apply', userAuth, couponController.applyCoupon);
router.post('/coupons/remove', userAuth, couponController.removeCoupon);


router.get('/orders', userAuth, orderController.loadOrders);
router.get('/orders/:orderId', userAuth, orderController.loadOrderDetails);
router.post('/orders/:orderId/cancel', userAuth, orderController.cancelOrder);
router.post('/orders/:orderId/return', userAuth, orderController.returnOrder);
router.get('/orders/:orderId/invoice', userAuth, orderController.generateInvoice);

router.get('/profile', userAuth, profileController.loadProfile);
router.get('/profile/edit', userAuth, profileController.loadEditProfile);
router.post('/profile/update', userAuth, handleProfileImageUpload, profileController.updateProfile);
router.get('/profile/change-password', userAuth, profileController.loadChangePassword);
router.post('/profile/change-password', userAuth, profileController.changePassword);


router.get('/profile/addresses', userAuth, profileController.loadAddressManagement);
router.post('/profile/addresses/add', userAuth, profileController.addAddress);
router.post('/profile/addresses/edit/:addressId', userAuth, profileController.editAddress);
router.get('/profile/addresses/delete/:addressId', userAuth, profileController.deleteAddress);
router.get('/profile/addresses/:addressId/data', userAuth, profileController.getAddressData);


router.get('/auth/google/signup', passport.authenticate('google-signup', {
  scope: ['profile', 'email'],
  prompt: 'select_account'
}));

router.get('/auth/google/signup/callback', passport.authenticate('google-signup', {
  failureRedirect: '/signup'
}), (req, res) => {
    req.session.user = {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      verified: req.user.verified,
      googleId: req.user.googleId,
    };
  res.redirect('/');
});


router.get('/auth/google/login', passport.authenticate('google-login', {
  scope: ['profile', 'email'],
  prompt: 'select_account'
}));
  

router.get('/auth/google/login/callback', passport.authenticate('google-login', {
  failureRedirect: '/login',
  failureFlash: true
}), (req, res) => {
  req.session.user = req.user; 
  res.redirect('/');
});


 router.post('/signupaction', userController.signup);
  router.post('/login', userController.login);

  router.post('/verify-otp', userController.verifyOTP);

 router.post('/resend-otp', userController.resendOTP);
 router.get('/logout', userController.logout);


router.get('/forgot-password', userController.loadForgotPassword);
router.post('/forgot-password', userController.sendResetOTP);
router.get('/verify-reset-otp', userController.loadResetPasswordOTP);
router.post('/verify-reset-otp', userController.verifyResetOTP);
router.post('/resend-reset-otp', userController.resendResetOTP);
router.post('/reset-password', userController.resetPassword);





//demo routes for test
const democontroller = require('../controllers/user/checkoutdemo')

router.get('/demo', democontroller.loadDemoCheckout)



module.exports = router;
