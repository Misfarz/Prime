const { Product } = require("../../models/productSchema");
const { Category } = require("../../models/categorySchema");

const getProducts = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;

  try {
    const total = await Product.countDocuments();
    const products = await Product.find()
      .populate("category")
      .skip(skip)
      .limit(limit);
    const categories = await Category.find();
    const totalPages = Math.ceil(total / limit);

    res.render("products", {
      products,
      categories,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("get products error", error);
    res.status(500).send("Server Error");
  }
};

const saveProduct = async (req, res) => {
  try {
    const {
      productId,
      productName,
      description,
      category,
      subcategory,
      regularPrice,
      salePrice,
      sizes,
      isNew,
      isFeatured,
      existingImages,
      productOffer,
    } = req.body;

    if (
      !productName ||
      !description ||
      !category ||
      !subcategory ||
      !regularPrice
    ) {
      return res.status(400).send("Missing required fields");
    }

    const existingProductName = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
      _id:{$ne: productId}
    });


    if (existingProductName) {
      return res.status(400).send("Product already exists");
    }

    // Process uploaded files with unique identifiers
    const productImages = req.files
      ? req.files.map((file) => `/uploads/products/${file.filename}`)
      : [];

    // Extract all existing images from request body
    const existingImageKeys = Object.keys(req.body).filter((key) =>
      key.startsWith("existingImages_")
    );
    const existingImagePaths = existingImageKeys.map((key) => req.body[key]);

    // Process existing images
    let finalImages = [];

    // Add existing images to final images array
    if (existingImagePaths.length > 0) {
      // Process each existing image path
      const processedExistingImages = existingImagePaths.map((img) => {
        // Remove any existing cache parameters
        return img.split("?")[0];
      });
      finalImages = [...processedExistingImages];
    }

    // Add new uploaded images
    finalImages = [...finalImages, ...productImages];

    // For backward compatibility, also check the original existingImages field
    if (existingImages && finalImages.length === 0) {
      if (Array.isArray(existingImages)) {
        const processedExistingImages = existingImages.map(
          (img) => img.split("?")[0]
        );
        finalImages = [...processedExistingImages, ...productImages];
      } else if (typeof existingImages === "string") {
        const cleanUrl = existingImages.split("?")[0];
        finalImages = [cleanUrl, ...productImages];
      }
    }

    if (!productId && finalImages.length !== 3) {
      return res
        .status(400)
        .send("Exactly 3 images are required for new products");
    }

    const categoryDoc = await Category.findById(category);
    if (!categoryDoc || !categoryDoc.subcategories.includes(subcategory)) {
      return res.status(400).send("Invalid subcategory");
    }

    let parsedSizes;
    try {
      parsedSizes = JSON.parse(sizes);
    } catch (error) {
      return res.status(400).send("Invalid sizes format");
    }

    if (!Array.isArray(parsedSizes)) {
      return res.status(400).send("Sizes must be an array");
    }

    const validSizes = parsedSizes.filter((s) => s.quantity > 0);
    if (validSizes.length === 0) {
      return res
        .status(400)
        .send("At least one size with quantity greater than 0 is required");
    }

    for (const size of validSizes) {
      if (
        !["XS", "S", "M", "L", "XL", "XXL"].includes(size.size) ||
        size.quantity < 0
      ) {
        return res.status(400).send("Invalid size or quantity");
      }
    }

    console.log("isNew value:", isNew);
    console.log("isFeatured value:", isFeatured);

    const productData = {
      productName,
      description,
      category,
      subcategory,
      sizes: validSizes,
      regularPrice: parseFloat(regularPrice),
      salePrice: salePrice ? parseFloat(salePrice) : null,
      productImage: finalImages.length > 0 ? finalImages : undefined,
      isNew: isNew === "true",
      isFeatured: isFeatured === "true",
      status: "Available",
      productOffer: productOffer ? parseFloat(productOffer) : 0,
    };

    let product;
    if (productId) {
      product = await Product.findByIdAndUpdate(productId, productData, {
        new: true,
      });
      if (!product) {
        return res.status(404).send("Product not found");
      }
    } else {
      product = new Product(productData);
      await product.save();
    }

    res.status(200).send("Product saved");
  } catch (error) {
    console.error("save product error", error);
    res.status(400).send(`Error: ${error.message}`);
  }
};

const unlistProduct = async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.query.id, { isListed: false });
    res.redirect("/admin/products");
  } catch (error) {
    console.error("unlist product error", error);
    res.status(500).send("Server Error");
  }
};

const listProduct = async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.query.id, { isListed: true });
    res.redirect("/admin/products");
  } catch (error) {
    console.error("list product error", error);
    res.status(500).send("Server Error");
  }
};

module.exports = {
  listProduct,
  unlistProduct,
  saveProduct,
  getProducts,
};
