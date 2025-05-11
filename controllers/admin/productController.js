const { Product } = require('../../models/productSchema');
const { Category } = require('../../models/categorySchema');

const getProducts = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    try {
        const total = await Product.countDocuments();
        const products = await Product.find()
            .populate('category')
            .skip(skip)
            .limit(limit);
        const categories = await Category.find();
        const totalPages = Math.ceil(total / limit);

        res.render('products', {
            products,
            categories,
            currentPage: page,
            totalPages
        });
    } catch (error) {
        console.error('get products error', error);
        res.status(500).send('Server Error');
    }
};

const saveProduct = async (req, res) => {
    try {
        console.log('saveProduct: Received request body:', req.body);
        console.log('saveProduct: Received files:', req.files);

        const {
            productId, productName, description, category, subcategory,
            regularPrice, salePrice, sizes, isNew, isFeatured, existingImages
        } = req.body;

        // Validate required fields
        if (!productName || !description || !category || !subcategory || !regularPrice) {
            return res.status(400).send('Missing required fields');
        }

        // Process uploaded images
        const productImages = req.files ? req.files.map(file => `/uploads/products/${file.filename}`) : [];
        
        // Handle existing images for product updates
        let finalImages = productImages;
        if (existingImages) {
            // If existingImages is an array, use it directly
            if (Array.isArray(existingImages)) {
                finalImages = [...existingImages, ...productImages];
            } 
            // If existingImages is a string (single image), convert to array
            else if (typeof existingImages === 'string') {
                finalImages = [existingImages, ...productImages];
            }
        }

        // Validate images for new products
        if (!productId && finalImages.length !== 3) {
            return res.status(400).send('Exactly 3 images are required for new products');
        }

        // Validate subcategory
        const categoryDoc = await Category.findById(category);
        if (!categoryDoc || !categoryDoc.subcategories.includes(subcategory)) {
            return res.status(400).send('Invalid subcategory');
        }

        // Parse and validate sizes
        let parsedSizes;
        try {
            parsedSizes = JSON.parse(sizes);
        } catch (error) {
            return res.status(400).send('Invalid sizes format');
        }

        if (!Array.isArray(parsedSizes)) {
            return res.status(400).send('Sizes must be an array');
        }

        // Filter sizes with quantity > 0 and validate
        const validSizes = parsedSizes.filter(s => s.quantity > 0);
        if (validSizes.length === 0) {
            return res.status(400).send('At least one size with quantity greater than 0 is required');
        }

        for (const size of validSizes) {
            if (!['XS', 'S', 'M', 'L', 'XL', 'XXL'].includes(size.size) || size.quantity < 0) {
                return res.status(400).send('Invalid size or quantity');
            }
        }

        console.log('isNew value:', isNew);
        console.log('isFeatured value:', isFeatured);

        // Prepare product data
        const productData = {
            productName,
            description,
            category,
            subcategory,
            sizes: validSizes,
            regularPrice: parseFloat(regularPrice),
            salePrice: salePrice ? parseFloat(salePrice) : null,
            productImage: finalImages.length > 0 ? finalImages : undefined,
            isNew: isNew === 'true',
            isFeatured: isFeatured === 'true',
            status: 'Available'
        };

        let product;
        if (productId) {
            // Update existing product
            product = await Product.findByIdAndUpdate(productId, productData, { new: true });
            if (!product) {
                return res.status(404).send('Product not found');
            }
        } else {
            // Create new product
            product = new Product(productData);
            await product.save();
        }

        res.status(200).send('Product saved');
    } catch (error) {
        console.error('save product error', error);
        res.status(400).send(`Error: ${error.message}`);
    }
};

const unlistProduct = async (req, res) => {
    try {
        await Product.findByIdAndUpdate(req.query.id, { isListed: false });
        res.redirect('/admin/products');
    } catch (error) {
        console.error('unlist product error', error);
        res.status(500).send('Server Error');
    }
};

const listProduct = async (req, res) => {
    try {
        await Product.findByIdAndUpdate(req.query.id, { isListed: true });
        res.redirect('/admin/products');
    } catch (error) {
        console.error('list product error', error);
        res.status(500).send('Server Error');
    }
};

module.exports = {
    listProduct,
    unlistProduct,
    saveProduct,
    getProducts
};