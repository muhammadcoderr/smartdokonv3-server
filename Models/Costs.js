const mongoose = require("mongoose");
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

let CostsSchema = new Schema({
  sellername: {
    type: String,
  },
  description: {
    type: String,
  },
  amount: {
    type: Number,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'bank'], // To'lov turlari
    default: 'cash'
  }
}, {
  timestamps: true
});

CostsSchema.plugin(mongoosePaginate); // Pagination qo'shish

module.exports = mongoose.model("Costs", CostsSchema);