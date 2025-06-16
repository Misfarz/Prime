const mongoose = require('mongoose');
const { type } = require('os');
const { boolean } = require('webidl-conversions');

const userSchema = mongoose.Schema({

    name: {
        type:String,
        required:true
    },
    email: {
       type:String,
       required: true,
       unique:true,
    },

    phone: {
        type: String,
        required:false,
        unique:false,
        sparse:true,
        default:null
    },
    googleId: {
        type:String,
        unique:true,
        sparse:true
    },
    password: {
        type:String,
        required:false,
    },

    isBlocked: {
        type:Boolean,
        default:false

    },

    isAdmin: {
        type:Boolean,
        default:false
    },
    
    profileImage: {
        type: String,
        default: '/images/default-profile.png'
    },
    addresses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Address'
    }],

    cart : {
        type:mongoose.Schema.Types.ObjectId,
        ref:"Cart"
    },

    wallet: {
        type:Number,
        default:0
    },
    
    notifications: [
        {
            message: String,
            type: String,
            read: {
                type: Boolean,
                default: false
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ],
    whishlist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
    }],

    orderHistory:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"Order"
        }
    ],

    createdOn : {

        type:Date,
        default:Date.now

    },

    referalCode: {
        type: String,
        unique: true
    },

    redeemed: {
        type: Boolean,
        default: false
    },

    redeemedUsers: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        }
    ],
    
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    searchHistory : [ {

        category: {
            type:mongoose.Schema.Types.ObjectId,
            ref:"Category"
        },

        brand : {
            type: String
        },
        
        searchOn : {
            type: Date,
            default: Date.now
        }


    }]
  
})


module.exports = mongoose.model("User",userSchema  )