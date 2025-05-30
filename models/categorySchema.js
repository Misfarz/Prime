const mongoose =require('mongoose')
const {Schema} = mongoose

const categorySchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    subcategories: [{
        type: String,
        trim: true
    }],
        description: {
      type: String,
      required: [true, "Category description is required"],
      trim: true,
    },
        isListed: {
      type: Boolean,
      default: true,
    },
        image: {
      type: String,
      required: [true, "Category image is required"],
    },
    categoryOffer: {
      type: Number,
      min: 0,
      default: 0
    },


}, { timestamps: true });


const Category = mongoose.model("Categories", categorySchema)

module.exports = {
    Category
}


