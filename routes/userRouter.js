const express = require('express');
const router = express.Router();
const userController = require("../controllers/user/userController");
const profileController = require("../controllers/user/profileController");
const wishlistController = require("../controllers/user/wishlistController");
const cartController = require("../controllers/user/cartController");
const checkoutController = require('../controllers/user/checkoutController');
const orderController = require('../controllers/user/orderController');
const couponController = require('../controllers/user/couponController');
const paymentController = require('../controllers/user/paymentController');
const { userAuth } = require('../middleware/auth');
const passport = require('passport');
const { uploadProfileImage, handleProfileImageUpload, uploadReturnImage } = require('../middleware/multerConfig');
const path = require('path');
const fs = require('fs');

router.get('/', userController.loadHomepage);
router.get('/login', userController.loadLogin);

router.get('/signup', userController.loadSignUp);
router.get('/verifyOTP', userController.loadVerifyOTP); 
router.get('/pageNotFound', userController.loadPageNotFound);
router.get('/shopall', userController.loadShopAll);
router.get('/shopall/filter-modal', userController.getFilterModalContent);
router.get('/bestsellers', userController.loadBestSellers);
router.get('/product/:id', userController.loadProductDetail);
router.get('/NewArrivals',userController.loadNewArrivals)


router.get('/wishlist', userAuth, wishlistController.loadWishlist);
router.post('/wishlist/add/:productId', userAuth, wishlistController.addToWishlist);
router.delete('/wishlist/remove/:productId', userAuth, wishlistController.removeFromWishlist);
router.get('/wishlist/check/:productId', userAuth, wishlistController.checkWishlistStatus);


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
router.post('/orders/:orderId/return', userAuth, uploadReturnImage, orderController.returnOrder);
router.get('/orders/:orderId/invoice', userAuth, orderController.generateInvoice);

router.get('/profile', userAuth, profileController.loadProfile);
router.get('/profile/edit', userAuth, profileController.loadEditProfile);
router.post('/profile/update', userAuth, handleProfileImageUpload, profileController.updateProfile);
router.get('/profile/change-password', userAuth, profileController.loadChangePassword);
router.post('/profile/change-password', userAuth, profileController.changePassword);

// Claim referral for Google users
router.post('/profile/claim-referral', userAuth, profileController.claimReferral);


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

router.post('/proceed-payment', userAuth, paymentController.proceedPayment);
router.post('/choose-payment', userAuth, paymentController.choosePayment);
router.post('/razorpay/verify', userAuth, paymentController.verifyRazorpayPayment);
router.get('/paymentFailure', userAuth, paymentController.paymentFailure);
router.get('/paymentSuccess/:orderId', userAuth, checkoutController.orderSuccess);


module.exports = router;
