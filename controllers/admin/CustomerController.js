const User = require("../../models/userSchema");

const customerInfo = async (req, res) => {
    try {
        let Search = "";
        if (req.query.search) {
            Search = req.query.search;
        }

        let page = parseInt(req.query.page) || 1;
        const limit = 5 ;

        const userData = await User.find({
            isAdmin: false,
            $or: [
                { firstname: { $regex: "." + Search + ".", $options: "i" } },
                { email: { $regex: "." + Search + ".", $options: "i" } }
            ]
        })
            .limit(limit)
            .skip((page - 1) * limit) 
            .exec();

        const count = await User.countDocuments({
            isAdmin: false,
            $or: [
                { firstname: { $regex: "." + Search + ".", $options: "i" } },
                { email: { $regex: "." + Search + ".", $options: "i" } }
            ]
        });

        res.render("customers", {
            data: userData,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        });

    } catch (error) {
        console.error("Error fetching customer data:", error);
        res.status(500).send("Internal Server Error");
    }
};

const customerBlocked = async (req, res,next) => {
    try {
        let id=req.query.id;
        await User.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect("/admin/customers")
    } catch (error) {
      console.error("block error",error)
    }
}
const customerUnblocked = async (req, res,next) => {
    try {
        let id=req.query.id;
        await User.updateOne({_id:id},{$set:{isBlocked:false}})
        res.redirect('/admin/customers')
    } catch (error) {
       console.error("unbock error",error)
    }
}

module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked,

};