const express = require('express');
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const CustomerController = require('../controllers/admin/CustomerController');
const { adminAuth } = require('../middleware/auth');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');
const dashboardController = require('../controllers/admin/dashboardController');
const { uploadCategory, uploadProduct } = require('../middleware/multerConfig');
const path = require('path');

router.get('/login', adminController.loadLogin);
router.get('/pageerror', adminController.loadPageError);
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

router.get('/orders', adminAuth, orderController.loadOrders);
router.get('/orders/:orderId', adminAuth, orderController.loadOrderDetails);

router.post('/loginaction', adminController.login);
router.post('/saveCategory', uploadCategory.single('image'), categoryController.saveCategory);
router.post('/saveProduct', uploadProduct.array('productImage', 3), productController.saveProduct);

// Order management API routes
router.post('/orders/update-status', adminAuth, orderController.updateOrderStatus);
router.post('/orders/verify-return', adminAuth, orderController.verifyReturnRequest);

// Coupon management routes
router.get('/coupons', adminAuth, couponController.loadCoupons);
router.post('/coupons/create', adminAuth, couponController.createCoupon);
router.get('/coupons/:couponId', adminAuth, couponController.getCouponDetails);
router.put('/coupons/:couponId', adminAuth, couponController.updateCoupon);
router.delete('/coupons/:couponId', adminAuth, couponController.deleteCoupon);
router.patch('/coupons/:couponId/toggle-status', adminAuth, couponController.toggleCouponStatus);

// admin dashboard and sales report routes
router.get('/sales-report', adminAuth, dashboardController.loadSalesReport);
router.get('/sales-report/download/excel', adminAuth, dashboardController.downloadExcelReport);
router.get('/sales-report/download/pdf', adminAuth, dashboardController.downloadPdfReport);
router.get('/dashboard', adminAuth, dashboardController.loadDashboard);

module.exports = router;