const User = require('../models/userSchema')
const adminAuth = (req,res,next) => {

    if(req.session.admin){

        User.findById(req.session.admin)
        .then((data) => {

            if(data && data.isAdmin){
                next()
            }
            else{
                res.redirect("/admin/login")
            }

        })
        .catch((error) => {
            console.log("Error in AdminAuth midddleware",error);
            res.status(500).send("Internal server error")
        })
    }
    else{
        res.redirect("/admin/login")
    }

}


module.exports = {
    adminAuth
}