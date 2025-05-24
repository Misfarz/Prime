const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const { Product } = require('../../models/productSchema');

const loadOrders = async (req, res) => {
    try {
       
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || '';
        const sortField = req.query.sortField || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
        const statusFilter = req.query.status || '';
        
        
        let filter = {};
        
        
        if (searchQuery) {
            filter.$or = [
                { orderNumber: { $regex: searchQuery, $options: 'i' } }
            ];
        }
        
       
        if (statusFilter) {
            filter.orderStatus = statusFilter;
        }
        
       
        const sort = {};
        sort[sortField] = sortOrder;
        
  
        const orders = await Order.find(filter)
            .populate('user', 'name email phone')
            .sort(sort)
            .skip(skip)
            .limit(limit);
            
    
        const totalOrders = await Order.countDocuments(filter);
        const totalPages = Math.ceil(totalOrders / limit);

        const statuses = await Order.distinct('orderStatus');
        
        res.render('aorder', {
            admin: true,
            orders,
            currentPage: page,
            totalPages,
            totalOrders,
            limit,
            searchQuery,
            sortField,
            sortOrder: sortOrder === 1 ? 'asc' : 'desc',
            statusFilter,
            statuses,
            activeTab: 'orders'
        });
    } catch (error) {
        console.error('Error loading admin orders page:', error);
        res.status(500).render('admin/error', { 
            error: 'Failed to load orders page',
            activeTab: 'orders'
        });
    }
};

const loadOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;
       
        const order = await Order.findById(orderId)
            .populate('user', 'firstName lastName email phone')
            .populate({
                path: 'items.product',
                select: 'productName productImage regularPrice salePrice stock'
            });
        
        if (!order) {
            return res.redirect('/admin/orders');
        }
        
        res.render('aorder-details', {
            admin: true,
            order,
            activeTab: 'orders'
        });
    } catch (error) {
        console.error('Error loading order details:', error);
        res.status(500).render('admin/error', { 
            error: 'Failed to load order details',
            activeTab: 'orders'
        });
    }
};


const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;
        
   
        const validStatuses = ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status' 
            });
        }
        
      
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }
        
       
        order.orderStatus = status;
        
      
        if (status === 'Delivered') {
            order.deliveredAt = new Date();
        }
        
       
        if (status === 'Cancelled') {
            order.cancelledAt = new Date();
        }
        
        await order.save();
        
        res.json({ 
            success: true, 
            message: 'Order status updated successfully' 
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update order status' 
        });
    }
};


const verifyReturnRequest = async (req, res) => {
    try {
        const { orderId, action } = req.body;
        
        // Find the order
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }
        
        // Check if order is in returned status
        if (order.orderStatus !== 'Returned') {
            return res.status(400).json({ 
                success: false, 
                message: 'Order is not in returned status' 
            });
        }
        
        if (action === 'approve') {
            // Find the user
            const user = await User.findById(order.user);
            
            if (!user) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'User not found' 
                });
            }
            
            // Update product stock for each returned item
            for (const item of order.items) {
                try {
                    const productId = item.product;
                    const size = item.size;
                    const quantity = item.quantity;
                    
                    // Find the product
                    const product = await Product.findById(productId);
                    
                    if (!product) {
                        console.error(`Product not found: ${productId}`);
                        continue;
                    }
                    
                    // Find the size index
                    const sizeIndex = product.sizes.findIndex(s => s.size === size);
                    
                    if (sizeIndex !== -1) {
                        // Increase the quantity for the returned item
                        product.sizes[sizeIndex].quantity += quantity;
                        
                        // Update product status if it was out of stock
                        if (product.status === 'Out of stock') {
                            product.status = 'Available';
                        }
                        
                        // Save the updated product
                        await product.save();
                        
                        console.log(`Restored stock for ${product.productName}, size ${size}: ${product.sizes[sizeIndex].quantity}`);
                    } else {
                        console.error(`Size ${size} not found for product ${product.productName}`);
                    }
                } catch (error) {
                    console.error(`Error updating stock for product ${item.product}:`, error);
                }
            }
            
            // Update order status
            order.paymentStatus = 'Refunded';
            await order.save();
            
            res.json({ 
                success: true, 
                message: 'Return approved, amount refunded, and product stock restored' 
            });
        } else if (action === 'reject') {
            // Reject the return request
            order.orderStatus = 'Delivered';
            order.returnedAt = null;
            order.returnReason = null;
            await order.save();
            
            res.json({ 
                success: true, 
                message: 'Return request rejected' 
            });
        } else {
            res.status(400).json({ 
                success: false, 
                message: 'Invalid action' 
            });
        }
    } catch (error) {
        console.error('Error verifying return request:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify return request' 
        });
    }
};





module.exports = {
    loadOrders,
    loadOrderDetails,
    updateOrderStatus,
    verifyReturnRequest
};