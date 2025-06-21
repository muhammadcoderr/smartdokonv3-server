const mongoose = require("mongoose");
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

let SellerSchema = new Schema({
  firstname: {
    type: String,
    unique: true,
    required: true
  },
  phone: {
    type: Number,
  },
  login: {
    type: String,
  },
  password: {
    type: String,
  },
  status: {
    type: String,
  },
  type: {
    type: String,
    enum: ['admin', 'sotuvchi'],
    default: 'sotuvchi'
  },
  lastseen: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

SellerSchema.plugin(mongoosePaginate); // Plaginni qo'shish

module.exports = mongoose.model("Seller", SellerSchema);