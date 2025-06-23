const loadShopAll = async (req, res) => {
  try {
    const user = req.session.user;
    const sort = req.query.sort || "alphabetical-asc";
    const search = req.query.search || "";
    const categoryId = req.query.category || "";
    const subcategory = req.query.subcategory || "";
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : "";
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let sortOption;
    switch (sort) {
      case "low-to-high":
        sortOption = { salePrice: 1, regularPrice: 1 };
        break;
      case "high-to-low":
        sortOption = { salePrice:- 1, regularPrice: -1 };
        break;
      case "alphabetical-desc":
        sortOption = { productName: -1 };
        break;
      case "alphabetical-asc":
      default:
        sortOption = { productName: 1 };
        break;
    }

    const categories = await Category.find({ isListed: true }).sort({
      name: 1,
    });

    let selectedCategory = null;
    if (categoryId) {
      selectedCategory = await Category.findById(categoryId);
    }

    const subcategories = selectedCategory
      ? selectedCategory.subcategories
      : [];

    const query = { isListed: true };

    if (categoryId) {
      query.category = new mongoose.Types.ObjectId(categoryId);
    }

    if (subcategory) {
      query.subcategory = subcategory;
    }

    if (minPrice !== "" && maxPrice !== "") {
      query.$or = [
        { salePrice: { $gte: minPrice, $lte: maxPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $gte: minPrice, $lte: maxPrice } },
          ],
        },
      ];
    } else if (minPrice !== "") {
      query.$or = [
        { salePrice: { $gte: minPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $gte: minPrice } },
          ],
        },
      ];
    } else if (maxPrice !== "") {
      query.$or = [
        { salePrice: { $lte: maxPrice } },
        {
          $and: [
            { salePrice: { $exists: false } },
            { regularPrice: { $lte: maxPrice } },
          ],
        },
      ];
    }

    if (search) {
      if (query.$or) {
        const priceConditions = query.$or;
        query.$or = undefined;

        query.$and = [
          { $or: priceConditions },
          {
            $or: [
              { productName: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          },
        ];
      } else {
        query.$or = [
          { productName: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }
    }

    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    let products;
    
   products = await Product.find(query)
        .populate("category", "name")
        .sort(sortOption)
        .skip(skip)
        .limit(limit);
  

  

    const priceStats = await Product.aggregate([
      { $match: { isListed: true } },
      {
        $group: {
          _id: null,
          minPrice: { $min: { $ifNull: ["$salePrice", "$regularPrice"] } },
          maxPrice: { $max: "$regularPrice" },
        },
      },
    ]);

    const priceRange =
      priceStats.length > 0
        ? {
            min: Math.floor(priceStats[0].minPrice),
            max: Math.ceil(priceStats[0].maxPrice),
          }
        : { min: 0, max: 1000 };

    let searchMessage = "";
    if (search && products.length === 0) {
      searchMessage = `No products found matching "${search}". Try a different search term.`;
    } else if (search && products.length > 0) {
      searchMessage = `Showing results for "${search}"`;
    }

    let filterMessage = "";
    if (categoryId || subcategory || minPrice !== "" || maxPrice !== "") {
      filterMessage = "Filtered results";

      if (categoryId) {
        const category = categories.find(
          (cat) => cat._id.toString() === categoryId
        );
        if (category) {
          filterMessage += ` for category "${category.name}"`;

          if (subcategory) {
            filterMessage += ` > "${subcategory}"`;
          }
        }
      }

      if (minPrice !== "" && maxPrice !== "") {
        filterMessage += ` with price between $${minPrice} and $${maxPrice}`;
      } else if (minPrice !== "") {
        filterMessage += ` with price from $${minPrice}`;
      } else if (maxPrice !== "") {
        filterMessage += ` with price up to $${maxPrice}`;
      }
    }

    return res.render("shopall", {
      user: user || null,
      products,
      categories,
      subcategories,
      currentPage: page,
      totalPages,
      sort,
      search,
      searchMessage,
      filterMessage,
      categoryId,
      subcategory,
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      priceRange,
    });
  } catch (error) {
    console.error("Home page error:", error);
    res.status(500).render("page-404", { message: "Server Error" });
  }
};