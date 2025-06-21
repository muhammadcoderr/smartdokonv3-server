const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const mongoosePaginate = require('mongoose-paginate-v2'); // mongoose-paginate-v2 import qilish

let ProductSchema = new Schema({
    name: {
        type: String,
        trim: true
    },
    sellername: {
        type: String,
        trim: true
    },
    arrivalprice: {
        type: Number,
        min: 0
    },
    sellingprice: {
        type: Number,
        min: 0
    },
    avialable: {
        type: Number
    },
    category: {
        type: String,
        trim: true
    },
    barcode: {
        type: String,
        unique: true,
    },
    type: {
        type: String,
        trim: true
    }
}, { timestamps: true });

ProductSchema.plugin(mongoosePaginate); // ProductSchema ga mongoose-paginate-v2 pluginini qo'shish

module.exports = mongoose.model("Product", ProductSchema);