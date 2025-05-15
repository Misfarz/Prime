const express = require('express');
const router = express.Router();
const userController = require("../controllers/user/userController");
const passport = require('passport');


router.get('/', userController.loadHomepage);
router.get('/login', userController.loadLogin);

  router.get('/signup', userController.loadSignUp);
  router.get('/verifyOTP', userController.loadVerifyOTP); 
  router.get('/pageNotFound', userController.loadPageNotFound);
  router.get('/shopall', userController.loadShopAll);
  router.get('/product/:id', userController.loadProductDetail);
  // router.get('/Football', userController.loadFootball)


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
 router.get('/logout', userController.logout)

 module.exports = router;
