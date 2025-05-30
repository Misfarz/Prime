const {Product} = require("../../models/productSchema")
const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');
const Cart = require("../../models/cartSchema");
const { path } = require("pdfkit");


const loadDemoCheckout = async (req,res) => {

 try {

    if(!req.session.user){
        return res.render("login");
    }

    const userId = req.session.user._id
    const user = await User.findById(userId)

    const address = await Address.find({userId: userId}).sort({isDefault:-1,createdAt:-1})

    const cart = await Cart.findOne({user:userId}).populate({

        path:"items.product",
        select: 'productName productImage regularPrice salePrice discount'
    })

    let subtotal = 0
    let cartItems = []

    // Check if cart exists and has items before trying to access them
    if (cart && cart.items) {
        cartItems = cart.items.map(item => {
      const  itemprice = item.price
      const  itemTotal = itemprice * item.quantity
      
      subtotal += itemTotal


      return {
        ...item.toObject(),
        itemTotal
      }
    })
    }

    const shipping = 50;
    const tax = Math.round(subtotal * 0.05)
    const total = shipping + tax + subtotal


    return res.render('demo',{
        user: user || null,
        address,
        cart : {
          items: cartItems  
        },
        summary: {
                subtotal,
                shipping: cartItems.length > 0 ? shipping : 0,
                tax,
                total
            }

    })
    
 } catch (error) {

    console.error("error loading democheckout page",error)
    return res.status(500).render('error', { message: 'An error occurred while loading the checkout page' });
 }
    

}

module.exports = {
    loadDemoCheckout
}