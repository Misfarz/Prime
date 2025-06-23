const express = require('express')
const app = express()
const env = require('dotenv').config()
const db = require('./config/db')
const session = require('express-session')
const nocache = require('nocache')
const path = require('path')
const userRouter = require('./routes/userRouter')
const adminRouter = require('./routes/adminRouter')
const passport = require('./config/passport')
const flash = require('connect-flash');
db()
app.set("views", [
    path.join(__dirname, "views/user"),
    path.join(__dirname, "views/admin")
]);
app.set('view engine','ejs');
app.use(nocache());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie : {
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000
    }
}));
app.use(flash());
app.use((req, res, next) => {
  res.locals.error_msg = req.flash('error');
  res.locals.success_msg = req.flash('success');
  next();
});
app.use((req,res,next) => {
    res.locals.user = req.user
    next()
});
  



app.use('/',userRouter);
app.use('/admin',adminRouter);
app.use(passport.initialize());
app.use(passport.session());

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  // Log full error details for debugging
  console.error(err.stack || err);

  const status = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  // If the request is an AJAX/Fetch or explicitly asks for JSON, respond with JSON
  if (req.xhr || req.headers.accept?.includes("json") || req.originalUrl.startsWith("/api")) {
    return res.status(status).json({ success: false, message });
  }

  // Otherwise render the generic error page
  res.status(status).render("error", {
    error: message,
    user: req.session?.user,
  });
});
app.listen(process.env.PORT,() => {
    console.log("server is running")
});





module.exports = app;