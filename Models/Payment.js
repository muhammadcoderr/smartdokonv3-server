const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let PaymentSchema = new Schema({
    products: [
        {
            productId: {
                type: String,
            },
            quantity: {
                type: Number,
            },
            profit:{
                type: Number,
            },
            discount:{
                type: Number,
            },
            category: {
                type:String,
                trim: true
            }
            
        }
    ],
    sellerId: {
        type: String,
    },
    clientId: {
        type: String,
    },
    totalPrice: {
        type: Number,
    },
    discountPrice: {
        type: Number,
    },
    cash:{
        type: Number,
        min: 0
    },
    terminal:{
        type: Number,
        min: 0
    },
    cashback:{
        type: Number,
        min: 0
    },
    rate: {
        type: Number,
        min:0
    },
    indebtedness: {
        type: Number,
        min:0
    },
    date: {
        type: String,
    },
    status: {
        type: String,
    },
    profit: {
        type: Number
    }

},{timestamps: true})

module.exports = mongoose.model("Payment", PaymentSchema)