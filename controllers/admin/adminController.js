const User = require("../../models/userSchema");
const bcrypt = require("bcrypt");
require("dotenv").config();

const loadLogin = async (req, res) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }
    return res.render("admin-login", { message: null });
  } catch (error) {
    console.error("Login page not found:", error);
    return res.status(500).send("Server Error");
  }
};

const loadPageError = async (req, res) => {
  try {
    return res.render("page-error");
  } catch (error) {
    console.error("Error loading error page:", error);
    return res.status(500).send("Server Error");
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await User.findOne({ email, isAdmin: true });

    if (!admin) {
      return res.render("admin-login", { message: "Admin does not exist" });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);

    if (!passwordMatch) {
      return res.render("admin-login", { message: "Invalid credentials" });
    }

    req.session.admin = admin;
    return res.redirect("/admin/dashboard");
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).send("Internal Server Error");
  }
};

const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout Error:", err);
      return res.status(500).send("Internal Server Error");
    }
    return res.redirect("/admin/login");
  });
};

module.exports = {
  loadLogin,
  login,
  loadPageError,
  logout,
};
