const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderItemSchema = new Schema({
    product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    size: {
        type: String
    },
    color: {
        type: String
    },
    price: {
        type: Number,
        required: true
    },
    total: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
        default: 'Placed'
    },
    cancelledAt: {
        type: Date
    },
    returnedAt: {
        type: Date
    },
    cancelReason: {
        type: String
    },
    returnReason: {
        type: String
    }
});

const shippingAddressSchema = new Schema({
    fullName: {
        type: String,
        required: true
    },
    addressLine1: {
        type: String,
        required: true
    },
    addressLine2: {
        type: String
    },
    city: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    postalCode: {
        type: String,
        required: true
    },
    country: {
        type: String,
        required: true,
        default: 'India'
    },
    phone: {
        type: String,
        required: true
    }
});

const orderSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderNumber: {
        type: String,
        unique: true
    },
    items: [orderItemSchema],
    shippingAddress: shippingAddressSchema,
    paymentMethod: {
        type: String,
        enum: ['cod', 'card', 'razorpay', 'wallet'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Refunded', 'Partially Refunded'],
        default: 'Pending'
    },
    orderStatus: {
        type: String,
        enum: ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned', 'Partially Cancelled', 'Partially Returned'],
        default: 'Placed'
    },
    subtotal: {
        type: Number,
        required: true
    },
    shipping: {
        type: Number,
        required: true,
        default: 0
    },
    tax: {
        type: Number,
        required: true,
        default: 0
    },
    discount: {
        type: Number,
        default: 0
    },
    couponCode: {
        type: String
    },
    total: {
        type: Number,
        required: true
    },
    deliveredAt: {
        type: Date
    },
    cancelledAt: {
        type: Date
    },
    returnedAt: {
        type: Date
    },
    cancelReason: {
        type: String
    },
    returnReason: {
        type: String
    },
    invoiceUrl: {
        type: String
    }
}, { timestamps: true });


orderSchema.pre('save', async function(next) {
    if (!this.orderNumber) {
        
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const random = Math.floor(1000 + Math.random() * 9000); 
        
        this.orderNumber = `ORD-${year}${month}${day}-${random}`;
    }
    next();
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
