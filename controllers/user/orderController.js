const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product  = require('../../models/productSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const { sendWalletNotification } = require('../../utils/walletNotifier');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');


const loadOrders = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const userId = req.session.user._id;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.redirect('/login');
        }

        const searchQuery = req.query.search || '';
        
       
        let filter = { user: userId };
     
        if (searchQuery) {
            filter.$or = [
                { orderNumber: { $regex: searchQuery, $options: 'i' } },
                { orderStatus: { $regex: searchQuery, $options: 'i' } }
            ];
        }

        
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        
        const orders = await Order.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
            
        const totalOrders = await Order.countDocuments(filter);
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('orders', {
            user: req.session.user,
            orders,
            currentPage: page,
            totalPages,
            searchQuery,
            activeTab: 'orders'
        });
    } catch (error) {
        console.error('Error loading orders page:', error);
        res.status(500).render('error', { 
            error: 'Failed to load orders page',
            user: req.session.user
        });
    }
};


const loadOrderDetails = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const userId = req.session.user._id;
        const orderId = req.params.orderId;
        
       
        const order = await Order.findOne({ 
            _id: orderId, 
            user: userId 
        }).populate({
            path: 'items.product',
            select: 'productName productImage regularPrice salePrice stock'
        });
        
        if (!order) {
            return res.redirect('/profile?tab=orders');
        }

        res.render('order-details', {
            user: req.session.user,
            order,
            activeTab: 'orders'
        });
    } catch (error) {
        console.error('Error loading order details:', error);
        res.status(500).render('error', { 
            error: 'Failed to load order details',
            user: req.session.user
        });
    }
};


const cancelOrder = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const userId = req.session.user._id;
        const orderId = req.params.orderId;
        const { cancelReason } = req.body;
        
        
        const order = await Order.findOne({ _id: orderId, user: userId });
        
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        
        if (['Delivered', 'Returned', 'Cancelled'].includes(order.orderStatus)) {
            return res.status(400).json({ 
                success: false, 
                message: `Order cannot be cancelled because it is ${order.orderStatus.toLowerCase()}`
            });
        }
        
        
        order.orderStatus = 'Cancelled';
        order.cancelledAt = new Date();
        order.cancelReason = cancelReason || 'No reason provided';
        
        
        order.items.forEach(item => {
            item.status = 'Cancelled';
            item.cancelledAt = new Date();
            item.cancelReason = cancelReason || 'No reason provided';
        });
        
        
        for (const item of order.items) {
            await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: item.quantity } }
            );
        }
        
       
        if (order.paymentStatus === 'Paid' || order.paymentMethod === 'wallet') {
            try {
                // Add the refunded amount to the user's wallet
                const user = await User.findById(userId);
                if (!user) {
                    throw new Error(`User not found for refund: ${userId}`);
                }
                
                console.log(`Processing refund for cancelled order ${order._id}. Current wallet: ${user.wallet}, Order total: ${order.total}`);
                
                // Update user wallet balance with proper type conversion
                const currentWallet = Number(user.wallet || 0);
                const refundAmount = Number(order.total);
                
                if (isNaN(currentWallet) || isNaN(refundAmount)) {
                    throw new Error(`Invalid wallet (${user.wallet}) or refund amount (${order.total})`);
                }
                
                // Update user wallet balance
                user.wallet = currentWallet + refundAmount;
                const savedUser = await user.save();
                
                if (!savedUser) {
                    throw new Error('Failed to save user after wallet update');
                }
                
                console.log(`Updated user wallet. Previous: ${currentWallet}, Added: ${refundAmount}, New: ${savedUser.wallet}`);
                
                // Create wallet transaction record
                const walletTransaction = await WalletTransaction.create({
                    user: userId,
                    amount: refundAmount,
                    type: 'credit',
                    description: `Refund for cancelled order #${order.orderNumber}`,
                    orderId: order._id,
                    date: new Date()
                });
                
                if (!walletTransaction) {
                    throw new Error('Failed to create wallet transaction');
                }
                
                console.log(`Created wallet transaction: ${walletTransaction._id}`);
                
                // Send notification about the wallet transaction
                await sendWalletNotification(
                    userId,
                    'credit',
                    refundAmount,
                    `Refund for cancelled order #${order.orderNumber}`
                );
                
                console.log(`Refunded ${refundAmount} to user wallet for cancelled order ${order._id}`);
                
                // Update order payment status
                order.paymentStatus = 'Refunded';
                // Save order immediately after updating payment status
                await order.save();
                console.log(`Updated order payment status to Refunded and saved order ${order._id}`);
            } catch (error) {
                console.error(`Error processing refund for order ${order._id}:`, error);
                // Continue with order cancellation even if refund fails
                // Still update payment status even if refund fails
                order.paymentStatus = 'Refunded';
                await order.save();
                console.log(`Updated order payment status to Refunded despite refund error for order ${order._id}`);
            }
        }
        
        await order.save();
        
        return res.status(200).json({ 
            success: true, 
            message: 'Order cancelled successfully. Amount refunded to wallet.' 
        });
    } catch (error) {
        console.error('Error cancelling order:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to cancel order' 
        });
    }
};




const returnOrder = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const userId = req.session.user._id;
        const orderId = req.params.orderId;
        const { returnReason } = req.body;

        // Handle uploaded files
        const returnImages = req.files ? req.files.map(file => file.path.replace(/\\/g, '/').replace('public/', '')) : [];

        if (!returnReason) {
            return res.status(400).json({ 
                success: false, 
                message: 'Return reason is required' 
            });
        }

        const order = await Order.findOne({ _id: orderId, user: userId });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.orderStatus !== 'Delivered') {
            return res.status(400).json({ 
                success: false, 
                message: `Order cannot be returned because it is ${order.orderStatus.toLowerCase()}`
            });
        }

        order.orderStatus = 'Returned';
        order.returnedAt = new Date();
        order.returnReason = returnReason;
        order.returnImage = returnImages; // Save image paths
        order.returnStatus = 'For Verification';

        order.items.forEach(item => {
            item.status = 'Returned';
            item.returnedAt = new Date();
            item.returnReason = returnReason;
        });

        for (const item of order.items) {
            await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: item.quantity } }
            );
        }

        if (order.paymentStatus === 'Paid') {
            order.paymentStatus = 'Refunded';
        }

        await order.save();

        return res.status(200).json({ 
            success: true, 
            message: 'Your return request has been submitted successfully.' 
        });
    } catch (error) {
        console.error('Error returning order:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to submit return request.' 
        });
    }
};


const generateInvoice = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/login');
        }

        const userId = req.session.user._id;
        const orderId = req.params.orderId;
        
        
        const order = await Order.findOne({ 
            _id: orderId, 
            user: userId 
        }).populate({
            path: 'items.product',
            select: 'productName'
        });
        
        if (!order) {
            return res.status(404).send('Order not found');
        }
        
        
        const invoicesDir = path.join(__dirname, '../../public/uploads/invoices');
        if (!fs.existsSync(invoicesDir)) {
            fs.mkdirSync(invoicesDir, { recursive: true });
        }
        
       
        const invoiceFileName = `invoice-${order.orderNumber}.pdf`;
        const invoiceFilePath = path.join(invoicesDir, invoiceFileName);
        
       
        const doc = new PDFDocument({ margin: 50 });
        
    
        const stream = fs.createWriteStream(invoiceFilePath);
        doc.pipe(stream);
        
        
        doc.fontSize(20).text('Prime', { align: 'center' });
        doc.fontSize(10).text('Premium Sports Jerseys & Apparel', { align: 'center' });
        doc.moveDown();
        
        
        doc.fontSize(16).text('INVOICE', { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(10).text(`Invoice Number: INV-${order.orderNumber}`);
        doc.text(`Order Number: ${order.orderNumber}`);
        doc.text(`Order Date: ${new Date(order.createdAt).toLocaleDateString()}`);
        doc.text(`Payment Method: ${order.paymentMethod.toUpperCase()}`);
        doc.text(`Payment Status: ${order.paymentStatus}`);
        doc.moveDown();
        
       
        doc.fontSize(12).text('Customer Details');
        doc.fontSize(10).text(`Name: ${order.shippingAddress.fullName}`);
        doc.text(`Address: ${order.shippingAddress.addressLine1}`);
        if (order.shippingAddress.addressLine2) {
            doc.text(`         ${order.shippingAddress.addressLine2}`);
        }
        doc.text(`         ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}`);
        doc.text(`         ${order.shippingAddress.country}`);
        doc.text(`Phone: ${order.shippingAddress.phone}`);
        doc.moveDown();
        
      
        doc.fontSize(12).text('Order Items');
        doc.moveDown();
        
   
        const tableTop = doc.y;
        const itemX = 50;
        const descriptionX = 150;
        const quantityX = 300;
        const priceX = 350;
        const amountX = 450;
        
        doc.fontSize(10)
           .text('Item', itemX, tableTop)
           .text('Description', descriptionX, tableTop)
           .text('Qty', quantityX, tableTop)
           .text('Price', priceX, tableTop)
           .text('Amount', amountX, tableTop);
        
    
        doc.moveTo(50, tableTop + 15)
           .lineTo(550, tableTop + 15)
           .stroke();
        
      
        let tableRow = tableTop + 25;
        
        order.items.forEach((item, i) => {
            const itemNumber = i + 1;
            const productName = item.product.productName;
            const quantity = item.quantity;
            const price = item.price.toFixed(2);
            const amount = item.total.toFixed(2);
            
            doc.text(itemNumber.toString(), itemX, tableRow)
               .text(productName, descriptionX, tableRow)
               .text(quantity.toString(), quantityX, tableRow)
               .text(`₹${price}`, priceX, tableRow)
               .text(`₹${amount}`, amountX, tableRow);
            
            tableRow += 20;
            
            
            if (tableRow > 700) {
                doc.addPage();
                tableRow = 50;
            }
        });
        
   
        doc.moveTo(50, tableRow)
           .lineTo(550, tableRow)
           .stroke();
        
        tableRow += 15;
        
     
        doc.text('Subtotal:', 350, tableRow);
        doc.text(`₹${order.subtotal.toFixed(2)}`, amountX, tableRow);
        tableRow += 15;
        
        doc.text('Shipping:', 350, tableRow);
        doc.text(`₹${order.shipping.toFixed(2)}`, amountX, tableRow);
        tableRow += 15;
        
        doc.text('Tax:', 350, tableRow);
        doc.text(`₹${order.tax.toFixed(2)}`, amountX, tableRow);
        tableRow += 15;
        
        // Draw a line
        doc.moveTo(350, tableRow)
           .lineTo(550, tableRow)
           .stroke();
        
        tableRow += 15;
        
   
        doc.fontSize(12).text('Total:', 350, tableRow);
        doc.fontSize(12).text(`₹${order.total.toFixed(2)}`, amountX, tableRow);
        
       
        doc.fontSize(10).text('Thank you for shopping with Prime!', 50, 700, { align: 'center' });
        
       
        doc.end();
        
       
        stream.on('finish', () => {
            
            const invoiceUrl = `/uploads/invoices/${invoiceFileName}`;
            Order.findByIdAndUpdate(orderId, { invoiceUrl }).catch(err => {
                console.error('Error saving invoice URL:', err);
            });
            
            
            res.download(invoiceFilePath, invoiceFileName, (err) => {
                if (err) {
                    console.error('Error downloading invoice:', err);
                    res.status(500).send('Error downloading invoice');
                }
            });
        });
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).send('Error generating invoice');
    }
};

module.exports = {
    loadOrders,
    loadOrderDetails,
    cancelOrder,
    returnOrder,
    generateInvoice
};

