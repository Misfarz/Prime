const { Category } = require('../../models/categorySchema');

exports.getCategories = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    try {
        const total = await Category.countDocuments();
        const categories = await Category.find().skip(skip).limit(limit);
        const totalPages = Math.ceil(total / limit);

        res.render('category', {
            categories,
            currentPage: page,
            totalPages
        });
    } catch (error) {
        res.status(500).send('Server Error');
        console.error("get categories error",error)
    }
};

exports.saveCategory = async (req, res) => {
    try {
        const { categoryId, name, description, subcategories } = req.body;
        const image = req.file ? `/uploads/categories/${req.file.filename}` : undefined;

        let subcats = subcategories ? subcategories.split(',').map(s => s.trim()).filter(s => s) : [];

        if (categoryId) {
            // Update existing category
            const updateData = { name, description, subcategories: subcats };
            if (image) updateData.image = image;
            await Category.findByIdAndUpdate(categoryId, updateData);
        } else {
            // Create new category
            if (!image) return res.status(400).send('Image is required');
            const category = new Category({
                name,
                description,
                subcategories: subcats,
                image,
                isListed: true
            });
            await category.save();
        }
        res.status(200).send('Category saved');
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
};

exports.unlistCategory = async (req, res) => {
    try {
        await Category.findByIdAndUpdate(req.query.id, { isListed: false });
        res.redirect('/admin/categories');
    } catch (error) {
        res.status(500).send('Server Error');
          console.error("unlist categories error",error)
    }
};

exports.listCategory = async (req, res) => {
    try {
        await Category.findByIdAndUpdate(req.query.id, { isListed: true });
        res.redirect('/admin/categories');
    } catch (error) {
        res.status(500).send('Server Error');
          console.error("list categories error",error)
    }
};