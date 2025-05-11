const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
    productName: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    isListed: {
        type: Boolean,
        default: true
    },
    discount: {
        type: Number,
        min: 0
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'Categories',
        required: true
    },
    subcategory: {
        type: String,
        required: true
    },
    sizes: [{
        size: {
            type: String,
            enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 0
        }
    }],
    regularPrice: {
        type: Number,
        required: true,
        min: 0
    },
    salePrice: {
        type: Number,
        min: 0
    },
    productImage: {
        type: [String],
        required: true,
        default: []
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    isNew: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['Available', 'Out of stock', 'Discontinued'],
        default: 'Available'
    },
    review: [{
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        username: String,
        rating: Number,
        comment: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

module.exports = {
    Product
};