const mongoose = require("mongoose");
const mongoosePaginate = require('mongoose-paginate-v2');
const Schema = mongoose.Schema;

let ClientSchema = new Schema({
  firstname: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: Number,
    unique: true,
    required: true,
  },
  birthday: {
    type: Date,
  },
  referralCode: {
    type: String,
    unique: true,
  },
  address: {
    type: String,
  },
  bonus: {
    type: Number,
    min: 0
  },
  debts: [{
    description: {
      type: String,
      required: true
    },
    date: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    }
  }]
}, {
  collection: 'clients'
});

ClientSchema.plugin(mongoosePaginate); // Plaginni ClientSchema ga qo'shish

module.exports = mongoose.model("Client", ClientSchema);