const { Category } = require('../../models/categorySchema');

exports.getCategories = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    try {
       
        const searchFilter = search ? {
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { subcategories: { $elemMatch: { $regex: search, $options: 'i' } } }
            ]
        } : {};

      
        const total = await Category.countDocuments(searchFilter);
        
        
        const categories = await Category.find(searchFilter).skip(skip).limit(limit);
        const totalPages = Math.ceil(total / limit);

        res.render('category', {
            categories,
            currentPage: page,
            totalPages,
            search 
        });
    } catch (error) {
        res.status(500).send('Server Error');
        console.error("get categories error", error);
    }
};

exports.saveCategory = async (req, res) => {
    try {
        const { categoryId, name, description, subcategories, categoryOffer } = req.body;
        const image = req.file ? `/uploads/categories/${req.file.filename}` : undefined;

        let subcats = subcategories ? subcategories.split(',').map(s => s.trim()).filter(s => s) : [];

        const existingCategoryName = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      _id:{$ne:categoryId}
    });

    if (existingCategoryName) {
      return res.status(400).send("category already exists");
    }

        if (categoryId) {
        
            const updateData = { 
                name, 
                description, 
                subcategories: subcats,
                categoryOffer: categoryOffer ? parseFloat(categoryOffer) : 0
            };
            if (image) updateData.image = image;
            await Category.findByIdAndUpdate(categoryId, updateData);
        } else {
     
            if (!image) return res.status(400).send('Image is required');
            const category = new Category({
                name,
                description,
                subcategories: subcats,
                image,
                isListed: true,
                categoryOffer: categoryOffer ? parseFloat(categoryOffer) : 0
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