const express = require('express');
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const CustomerController = require('../controllers/admin/CustomerController');
const { adminAuth } = require('../middleware/auth');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const orderController = require('../controllers/admin/orderController');
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
        // Create a truly unique filename with original name, timestamp, and random string
        const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const originalExt = path.extname(file.originalname);
        cb(null, `${uniquePrefix}-${file.fieldname}${originalExt}`);
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

// Order management routes
router.get('/orders', adminAuth, orderController.loadOrders);
router.get('/orders/:orderId', adminAuth, orderController.loadOrderDetails);

router.post('/loginaction', adminController.login);
router.post('/saveCategory', uploadCategory.single('image'), categoryController.saveCategory);
router.post('/saveProduct', uploadProduct.array('productImage', 3), productController.saveProduct);

// Order management API routes
router.post('/orders/update-status', adminAuth, orderController.updateOrderStatus);
router.post('/orders/verify-return', adminAuth, orderController.verifyReturnRequest);

module.exports = router;