const passport = require('passport');
const User = require('../models/userSchema');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();


passport.use('google-signup', new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/signup/callback',
  passReqToCallback: true 
}, async (req,accessToken, refreshToken, profile, done) => {
  try {
  
    if (!profile || !profile.id || !profile.emails || !profile.emails[0]) {
      return done(null, false, { message: "Invalid profile data from Google" });
    }

    let user = await User.findOne({ googleId: profile.id });
    if (!user) {

      user = new User({
        name: profile.displayName,
        email: profile.emails[0].value,
        googleId: profile.id
      });

      await user.save();
    } 



    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));


passport.use('google-login', new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/login/callback',
  passReqToCallback: true,
  state:true
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    if (!profile || !profile.id || !profile.emails || !profile.emails[0]) {
      return done(null, false, { message: 'Invalid data from Google.' });
    }

    const user = await User.findOne({ googleId: profile.id });

    if (!user) {
      return done(null, false, { message: "No account found. Please sign up first." });
    }

    if (user.isBlocked) {
      return done(null, false, { message: "User is blocked by admin." });
    }
    return done(null, user);
  } catch (err) {
    console.error("Google login error:", err);
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async(id, done) => {
 try {
     const user= await User.findById(id);
      done(null,user)
 } catch (error) {
     done(err,null)
 }
});

module.exports = passport;
