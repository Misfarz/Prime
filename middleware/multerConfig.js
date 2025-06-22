const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ======================
// ADMIN UPLOAD CONFIGURATIONS
// ======================

// Category Storage Configuration
const categoryStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/categories');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// Product Storage Configuration
const productStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/products');
    },
    filename: (req, file, cb) => {
        const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        const originalExt = path.extname(file.originalname);
        cb(null, `${uniquePrefix}-${file.fieldname}${originalExt}`);
    }
});

// ======================
// USER UPLOAD CONFIGURATIONS
// ======================

// Profile Storage Configuration
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'public/uploads/profiles';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const userId = req.session.user?._id || 'unknown';
        cb(null, userId + '-' + Date.now() + path.extname(file.originalname));
    }
});

// Return Storage Configuration
const returnStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'public/uploads/returns';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, req.params.orderId + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File Filter for Images
const fileFilter = (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
        return cb(null, true);
    }
    cb('Error: Images only!');
};

// Multer Upload Instances
const uploadCategory = multer({
    storage: categoryStorage,
    fileFilter
});

const uploadProduct = multer({
    storage: productStorage,
    fileFilter
});

const uploadProfileImage = multer({ 
    storage: profileStorage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
}).single('profileImage');

const uploadReturnImage = multer({
    storage: returnStorage,
    fileFilter
}).array('returnImages', 3);

// Middleware for handling profile image upload with error handling
const handleProfileImageUpload = (req, res, next) => {
    uploadProfileImage(req, res, function(err) {
        if (err instanceof multer.MulterError) {
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
            return res.status(400).render('edit-profile', { 
                user: req.session.user,
                error: err.message
            });
        }
        next();
    });
};

module.exports = {
    uploadCategory,
    uploadProduct,
    uploadProfileImage,
    uploadReturnImage,
    handleProfileImageUpload
};
