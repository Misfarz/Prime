const mongoose = require('mongoose')
const {Schema} = mongoose

const couponSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        default: '',
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    expireOn: {
        type: Date,
        required: true,
    },
    offerPrice: {
        type: Number,
        required: true,
    },
    discountType: {
        type: String,
        enum: ['percentage', 'amount'],
        default: 'amount',
        required: true
    },
    minimumPrice: {
        type: Number,
        required: true
    },
    usageLimit: {
        type: Number,
        default: 0 
    },
    usageCount: {
        type: Number,
        default: 0
    },
    isList: {
        type: Boolean,
        default: true
    },
    userId: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }]
})

const Coupon = mongoose.model('Coupon', couponSchema)

module.exports = Coupon
