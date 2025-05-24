const mongoose = require('mongoose');
const Cart = require('../../models/cartSchema');
const User = require('../../models/userSchema');
const { Product } = require('../../models/productSchema');
const { Category } = require('../../models/categorySchema');

const MAX_QUANTITY_PER_PRODUCT = 20;


const addToCart = async (req, res) => {
    try {
        
        
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Please login to add items to cart' });
        }

        const userId = req.session.user._id;
        const { productId, size, quantity = 1 } = req.body;
        
        
       
        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

    
        if (!product.isListed ) {
            return res.status(400).json({ success: false, message: 'This product is currently unavailable' });
        }

      
        if (product.category && !product.category.isListed) {
            return res.status(400).json({ success: false, message: 'This product category is currently unavailable' });
        }

      
        if (product.status === 'Out of stock') {
            return res.status(400).json({ success: false, message: 'This product is out of stock' });
        }

       
        const sizeObj = product.sizes.find(s => s.size === size);
        if (!sizeObj) {
            return res.status(400).json({ success: false, message: 'Selected size is not available for this product' });
        }

      
        if (sizeObj.quantity < quantity) {
            return res.status(400).json({ 
                success: false, 
                message: `Only ${sizeObj.quantity} items available in stock for the selected size` 
            });
        }

    
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        let cart;
        
        if (!user.cart) {
            cart = new Cart({
                user: userId,
                items: [],
                totalAmount: 0
            });
            
            
            await cart.save();
           
            
          
            user.cart = cart._id;
            await user.save();
          
        } else {
          
         
            cart = await Cart.findById(user.cart);
            
            if (!cart) {
                console.log('Cart reference exists but cart not found, creating new cart');
             
                cart = new Cart({
                    user: userId,
                    items: [],
                    totalAmount: 0
                });
                
                await cart.save();
         
                
                
                user.cart = cart._id;
                await user.save();
                console.log('User updated with new cart reference');
            } else {
                console.log('no existing cart found');
            }
        }

     
        const price = product.salePrice || product.regularPrice;

        
        const existingItemIndex = cart.items.findIndex(
            item => item.product.toString() === productId && item.size === size
        );

        if (existingItemIndex > -1) {
     
            const newQuantity = cart.items[existingItemIndex].quantity + parseInt(quantity);
            
    
            if (newQuantity > MAX_QUANTITY_PER_PRODUCT) {
                return res.status(400).json({ 
                    success: false, 
                    message: `You can only add up to ${MAX_QUANTITY_PER_PRODUCT} units of this product to your cart` 
                });
            }
            
           
            if (newQuantity > sizeObj.quantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Only ${sizeObj.quantity} items available in stock for the selected size` 
                });
            }
            
       
            cart.items[existingItemIndex].quantity = newQuantity;
        } else {
          
            if (parseInt(quantity) > MAX_QUANTITY_PER_PRODUCT) {
                return res.status(400).json({ 
                    success: false, 
                    message: `You can only add up to ${MAX_QUANTITY_PER_PRODUCT} units of this product to your cart` 
                });
            }
            
            cart.items.push({
                product: productId,
                quantity: parseInt(quantity),
                size,
                price
            });
        }

       
        cart.totalAmount = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
        cart.updatedAt = Date.now();
        
        await cart.save();

        
        if (user.whishlist && user.whishlist.includes(productId)) {
            user.whishlist = user.whishlist.filter(id => id.toString() !== productId);
            await user.save();
        }

      
        if (!req.session.user.cartCount) {
            req.session.user.cartCount = 0;
        }
        req.session.user.cartCount = cart.items.length;

        return res.status(200).json({ 
            success: true, 
            message: 'Product added to cart successfully',
            cartCount: cart.items.length
        });
    } catch (error) {
        console.error('Error adding to cart:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


const getCart = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Please login to view your cart' });
        }

        const userId = req.session.user._id;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.cart) {
            return res.render('cart', { 
                user: req.session.user,
                cartItems: [],
                totalAmount: 0,
                outOfStockItems: []
            });
        }

        const cart = await Cart.findById(user.cart).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        });

        if (!cart) {
            return res.render('cart', { 
                user: req.session.user,
                cartItems: [],
                totalAmount: 0,
                outOfStockItems: []
            });
        }

        
        const validItems = cart.items.filter(item => item.product !== null);
        
        
        const outOfStockItems = [];
        const availableItems = validItems.filter(item => {
            const product = item.product;
            const sizeObj = product.sizes.find(s => s.size === item.size);
            
         
            const isUnavailable =
              !product.isListed ||
              product.status === "Out of stock" ||
              product.status === "Discontinued" ||
              !product.category.isListed ||
              !sizeObj ||
              sizeObj.quantity < item.quantity;
            
            if (isUnavailable) {
                outOfStockItems.push(item);
            }
            
            return !isUnavailable;
        });

       
        const totalAmount = availableItems.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);

        return res.render('cart', { 
            user: req.session.user,
            cartItems: validItems,
            totalAmount,
            outOfStockItems
        });
    } catch (error) {
        console.error('Error getting cart:', error);
        return res.status(500).render('page-404', { message: 'Server Error' });
    }
};


const loadCart = async (req, res) => {
    try {
      
        
        if (!req.session.user) {
         
            return res.redirect('/login');
        }

        const userId = req.session.user._id;
       
        
        const user = await User.findById(userId);
        
        
        if (!user) {
            return res.redirect('/login');
        }

        if (!user.cart) {
         
            req.session.user.cartCount = 0;
            await new Promise((resolve, reject) => {
                req.session.save(err => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            return res.render('cart', { 
                user: req.session.user,
                cartItems: [],
                totalAmount: 0,
                outOfStockItems: []
            });
        }

        const cart = await Cart.findById(user.cart).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        });

        if (!cart) {
           
            req.session.user.cartCount = 0;
            await new Promise((resolve, reject) => {
                req.session.save(err => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            return res.render('cart', { 
                user: req.session.user,
                cartItems: [],
                totalAmount: 0,
                outOfStockItems: []
            });
        }

    
        const validItems = cart.items.filter(item => item.product !== null);
        
        
        const outOfStockItems = [];
        const availableItems = validItems.filter(item => {
            const product = item.product;
            const sizeObj = product.sizes.find(s => s.size === item.size);
            
            
            const isUnavailable = !product.isListed || 
                                 product.status === 'Out of stock' || 
                                 product.status === 'Discontinued' ||
                                 !product.category.isListed ||
                                 !sizeObj || 
                                 sizeObj.quantity < item.quantity;
            
            if (isUnavailable) {
                outOfStockItems.push(item);
            }
            
            return !isUnavailable;
        });

      
        const totalAmount = availableItems.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
      

      
        req.session.user.cartCount = validItems.length;
     
        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) reject(err);
                else resolve();
            });
        });

        
        return res.render('cart', { 
            user: req.session.user,
            cartItems: validItems,
            totalAmount,
            outOfStockItems
        });
    } catch (error) {
        console.error('Error loading cart page:', error);
        return res.status(500).render('page-404', { message: 'Server Error' });
    }
};


const updateCartItemQuantity = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Please login to update your cart' });
        }

        const userId = req.session.user._id;
        const { itemId, action } = req.body;

        const user = await User.findById(userId);
        if (!user || !user.cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

            const cart = await Cart.findById(user.cart);
            if (!cart) {
                return res.status(404).json({ success: false, message: 'Cart not found' });
            }

        
            const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
            if (itemIndex === -1) {
                return res.status(404).json({ success: false, message: 'Item not found in cart' });
            }
        
            const cartItem = cart.items[itemIndex];
            
        
            const product = await Product.findById(cartItem.product);
            if (!product) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

        const sizeObj = product.sizes.find(s => s.size === cartItem.size);
        if (!sizeObj) {
            return res.status(404).json({ success: false, message: 'Product size not found' });
        }

        let newQuantity = cartItem.quantity;

        if (action === 'increment') {
            newQuantity += 1;
            
      
            if (newQuantity > MAX_QUANTITY_PER_PRODUCT) {
                return res.status(400).json({ 
                    success: false, 
                    message: `You can only add up to ${MAX_QUANTITY_PER_PRODUCT} units of this product to your cart` 
                });
            }
            
           
            if (newQuantity > sizeObj.quantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Only ${sizeObj.quantity} items available in stock for the selected size` 
                });
            }
        } else if (action === 'decrement') {
            if (newQuantity <= 1) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Quantity cannot be less than 1. Use remove button to delete item.' 
                });
            }
            newQuantity -= 1;
        } else {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

       
        cart.items[itemIndex].quantity = newQuantity;
        
      
        cart.totalAmount = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
        cart.updatedAt = Date.now();
        
        await cart.save();

     
        req.session.user.cartCount = cart.items.length;
        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) reject(err);
                else resolve();
            });
        });

        return res.status(200).json({ 
            success: true, 
            message: 'Cart updated successfully',
            newQuantity,
            itemTotal: cartItem.price * newQuantity,
            cartTotal: cart.totalAmount
        });
    } catch (error) {
        console.error('Error updating cart item quantity:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


const removeFromCart = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Please login to remove items from cart' });
        }

        const userId = req.session.user._id;
        const { itemId } = req.params;

        const user = await User.findById(userId);
        if (!user || !user.cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const cart = await Cart.findById(user.cart);
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

    
        const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

  
        cart.items.splice(itemIndex, 1);
        
        
        cart.totalAmount = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
        cart.updatedAt = Date.now();
        
        await cart.save();

      
        req.session.user.cartCount = cart.items.length;
        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) reject(err);
                else resolve();
            });
        });

        return res.status(200).json({ 
            success: true, 
            message: 'Item removed from cart successfully',
            cartCount: cart.items.length,
            cartTotal: cart.totalAmount
        });
    } catch (error) {
        console.error('Error removing item from cart:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


const clearCart = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Please login to clear your cart' });
        }

        const userId = req.session.user._id;
        const user = await User.findById(userId);
        
        if (!user || !user.cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const cart = await Cart.findById(user.cart);
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        cart.items = [];
        cart.totalAmount = 0;
        cart.updatedAt = Date.now();
        
        await cart.save();

     
        req.session.user.cartCount = 0;
        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) reject(err);
                else resolve();
            });
        });

        return res.status(200).json({ 
            success: true, 
            message: 'Cart cleared successfully'
        });
    } catch (error) {
        console.error('Error clearing cart:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


const validateCartForCheckout = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Please login to proceed to checkout' });
        }

        const userId = req.session.user._id;
        const user = await User.findById(userId);
        
        if (!user || !user.cart) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        const cart = await Cart.findById(user.cart).populate({
            path: 'items.product',
            populate: {
                path: 'category'
            }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

       
        const unavailableItems = [];
        
        for (const item of cart.items) {
            if (!item.product) {
                unavailableItems.push({
                    id: item._id,
                    message: 'Product no longer exists'
                });
                continue;
            }

            const product = item.product;
            
            
            if (!product.isListed || product.status === 'Discontinued') {
                unavailableItems.push({
                    id: item._id,
                    productName: product.productName,
                    message: 'Product is no longer available'
                });
                continue;
            } 

          
            if (product.category && !product.category.isListed) {
                unavailableItems.push({
                    id: item._id,
                    productName: product.productName,
                    message: 'Product category is no longer available'
                });
                continue;
            }

       
            if (product.status === 'Out of stock') {
                unavailableItems.push({
                    id: item._id,
                    productName: product.productName,
                    message: 'Product is out of stock'
                });
                continue;
            }

        
            const sizeObj = product.sizes.find(s => s.size === item.size);
            if (!sizeObj) {
                unavailableItems.push({
                    id: item._id,
                    productName: product.productName,
                    message: 'Selected size is no longer available'
                });
                continue;
            } 

            if (sizeObj.quantity < item.quantity) {
                unavailableItems.push({
                    id: item._id,
                    productName: product.productName,
                    size: item.size,
                    requestedQuantity: item.quantity,
                    availableQuantity: sizeObj.quantity,
                    message: `Only ${sizeObj.quantity} items available in stock for the selected size`
                });
                continue;
            }
        }

        if (unavailableItems.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Some items in your cart are unavailable',
                unavailableItems
            });   
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Cart is valid for checkout'
        });
    } catch (error) {
        console.error('Error validating cart for checkout:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
const debugCart = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not logged in' });
        }

        const userId = req.session.user._id;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.cart) {
            return res.json({
                status: 'No cart',
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                },
                session: req.session.user
            });
        }

        const cart = await Cart.findById(user.cart);
        if (!cart) {
            return res.json({
                status: 'Cart reference exists but cart not found',
                cartId: user.cart,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                }
            });
        }

    
        return res.json({
            status: 'Cart found',
            cart: {
                id: cart._id,
                itemCount: cart.items.length,
                totalAmount: cart.totalAmount,
                items: cart.items.map(item => ({
                    id: item._id,
                    productId: item.product,
                    size: item.size,
                    quantity: item.quantity,
                    price: item.price
                }))
            },
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                cartCount: req.session.user.cartCount
            }
        });
    } catch (error) {
        console.error('Debug cart error:', error);
        return res.status(500).json({ error: error.message, stack: error.stack });
    }
};

module.exports = {
    addToCart,
    getCart,
    loadCart,
    updateCartItemQuantity,
    removeFromCart,
    clearCart,
    validateCartForCheckout,
    debugCart
};
