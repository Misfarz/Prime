const Cart = require('../../models/cartSchema');
const {Product} = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');

const loadCheckout = async (req, res, next) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const userId = req.session.user._id;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.redirect('/login');
        }

       
        const addresses = await Address.find({ userId: userId }).sort({ isDefault: -1, createdAt: -1 });

       
        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.product',
            select: 'productName productImage regularPrice salePrice discount'
        });

        if (!cart || cart.items.length === 0) {
            return res.redirect('/cart?error=Cart is empty');
        }

        
        let subtotal = 0;
        let totalDiscount = 0;
      
        const cartItems = cart.items.map(item => {
            const itemPrice = item.price;
            const itemTotal = itemPrice * item.quantity;
            subtotal += itemTotal;
            
           
            const product = item.product;
            let discount = 0;
          
            
            return {
                ...item.toObject(),
                itemTotal,
           
            };
        });

       
        const shipping = 50;
        const tax = Math.round(subtotal * 0.05); 
        const total = subtotal + shipping + tax - totalDiscount;
      
        res.render('checkout', {
            user,
            addresses,
            cart: {
                items: cartItems
            },
            summary: {
                subtotal,
                shipping,
                tax,
                total
            }
        });
    } catch (error) {
        console.error('Error loading checkout', error);
        res.status(500).render('user/error', { 
            error: 'Failed to load checkout page',
            user: req.session.user
        });
    }
};



const placeOrder = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const userId = req.session.user._id;
        const { addressId, paymentMethod } = req.body;

        if (!addressId || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'Address and payment method are required'
            });
        }

     
        const user = await User.findById(userId);
        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'items.product',
            select: 'productName productImage regularPrice salePrice discount'
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

       
        const selectedAddress = await Address.findOne({ _id: addressId, userId: userId });
        if (!selectedAddress) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address selected'
            });
        }

       
        let subtotal = 0;

        
        const orderItems = cart.items.map(item => {
            const itemPrice = item.price;
            const itemTotal = itemPrice * item.quantity;
            subtotal += itemTotal;
            
            return {
                product: item.product._id,
                quantity: item.quantity,
                size: item.size,
                price: itemPrice,
                total: itemTotal,
                
            };
        });

       
        const shipping = 50; 
        const tax = Math.round(subtotal * 0.05);
        const total = subtotal + shipping + tax ;

        
        const newOrder = new Order({
            user: userId,
            items: orderItems,
            shippingAddress: {
                fullName: selectedAddress.fullName,
                addressLine1: selectedAddress.addressLine1,
                addressLine2: selectedAddress.addressLine2 || '',
                city: selectedAddress.city,
                state: selectedAddress.state,
                postalCode: selectedAddress.postalCode,
                country: selectedAddress.country,
                phone: selectedAddress.phone
            },
            paymentMethod,
            paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Paid',
            orderStatus: 'Placed',
            subtotal,
            shipping,
            tax,
            total
        });

        const savedOrder = await newOrder.save();

        
        user.orderHistory.push(savedOrder._id);
        await user.save();

        await Cart.findOneAndUpdate(
            { user: userId },
            { $set: { items: [], totalAmount: 0 } }
        );

        
        for (const item of cart.items) {
            
        
            
            try {
              
                const productId = typeof item.product === 'object' ? item.product._id : item.product;
                const size = item.size;
                
              
                const product = await Product.findById(productId);
                
                if (!product) {
                    console.error(`Product not found: ${productId}`);
                    continue;
                }
                
               
                const sizeIndex = product.sizes.findIndex(s => s.size === size);
                
                if (sizeIndex !== -1) {
                    
                    product.sizes[sizeIndex].quantity = Math.max(0, product.sizes[sizeIndex].quantity - item.quantity);
                    
                    
                    const allSizesOutOfStock = product.sizes.every(s => s.quantity <= 0);
                    
                    
                    if (allSizesOutOfStock) {
                        product.status = 'Out of stock';
                    }
                    
                    
                    await product.save();
                    
                    console.log(`Updated stock for ${product.productName}, size ${size}: ${product.sizes[sizeIndex].quantity}`);
                } else {
                    console.error(`Size ${size} not found for product ${product.productName}`);
                }
            } catch (error) {
                console.error(`Error updating stock for product ${item.product}:`, error);
            }
        }

        
        return res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            orderId: savedOrder._id,
            redirectUrl: `/order-success/${savedOrder._id}`
        });
    } catch (error) {
        console.error('Error placing order:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to place order'
        });
    }
};

const orderSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        if (!req.session.user) {
            return res.redirect('/login');
        }

       
        const order = await Order.findById(orderId).populate({
            path: 'items.product',
            select: 'productName productImage regularPrice salePrice'
        });

        if (!order || order.user.toString() !== req.session.user._id) {
            return res.redirect('/profile?tab=orders');
        }

        
        const user = await User.findById(req.session.user._id);

        res.render('order-success', {
            user: req.session.user,
            order,
            userName: user.firstName || 'Valued Customer',
            orderDate: order.createdAt.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            orderStatus: order.orderStatus
        });
    } catch (error) {
        console.error('Error loading order success page:', error);
        res.status(500).render('error', { 
            error: 'Failed to load order success page',
            user: req.session.user
        });
    }
};

module.exports = {
    loadCheckout,
    placeOrder,
    orderSuccess
};
