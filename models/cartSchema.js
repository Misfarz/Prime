const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartItemSchema = new Schema({
    product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1
    },
    size: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    addedAt: {
        type: Date,
        default: Date.now
    }
});

const cartSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [cartItemSchema],
    coupon: {
        code: {
            type: String
        },
        discount: {
            type: Number
        },
        couponId: {
            type: Schema.Types.ObjectId,
            ref: 'Coupon'
        }
    },
    totalAmount: {
        type: Number,
        default: 0
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Remove any cart items where the referenced product no longer exists
cartSchema.pre('validate', function (next) {
  // `this` refers to the Cart document being validated
  if (Array.isArray(this.items)) {
    this.items = this.items.filter((item) => !!item.product);
  }
  next();
});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;

