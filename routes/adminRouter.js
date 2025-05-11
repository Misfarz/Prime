const express = require('express');
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const CustomerController = require('../controllers/admin/CustomerController');
const { adminAuth } = require('../middleware/auth');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const multer = require('multer');
const path = require('path');

const categoryStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/categories');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});


const productStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/products');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
        return cb(null, true);
    }
    cb('Error: Images only!');
};

const uploadCategory = multer({
    storage: categoryStorage,
    fileFilter
});

const uploadProduct = multer({
    storage: productStorage,
    fileFilter
});


router.get('/login', adminController.loadLogin);
router.get('/pageerror', adminController.loadPageError);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/logout',  adminController.logout);
router.get('/customers', adminAuth, CustomerController.customerInfo);
router.get('/blockCustomer',adminAuth, CustomerController.customerBlocked);
router.get('/unblockCustomer',adminAuth, CustomerController.customerUnblocked);
router.get('/categories',adminAuth, categoryController.getCategories);
router.get('/unlistCategory',adminAuth, categoryController.unlistCategory);
router.get('/listCategory',adminAuth, categoryController.listCategory);
router.get('/products',adminAuth, productController.getProducts);
router.get('/unlistProduct',adminAuth, productController.unlistProduct);
router.get('/listProduct',adminAuth, productController.listProduct);


router.post('/loginaction', adminController.login);
router.post('/saveCategory', uploadCategory.single('image'), categoryController.saveCategory);
router.post('/saveProduct', uploadProduct.array('productImage', 3), productController.saveProduct);

module.exports = router;