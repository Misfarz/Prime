const mongoose = require('mongoose');
const { Schema } = mongoose;

const variantSchema = new Schema({
    product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    variantType: {
        type: String,
        required: true,
        enum: ['Standard', 'Player Version'],
        trim: true
    },
    regularPrice: {
        type: Number,
        required: true,
        min: 0
    },
    salePrice: {
        type: Number,
        min: 0
    },
    productOffer: {
        type: Number,
        default: 0,
        min: 0
    },
    sizes: [{
        size: {
            type: String,
            required: true,
            enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], // Add more sizes as needed
            trim: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 0,
            default: 0
        }
    }],
}, { timestamps: true });

const Variant = mongoose.model('Variant', variantSchema);

module.exports = {
    Variant
};