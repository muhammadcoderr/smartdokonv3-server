const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let DebtsSchema = new Schema({
    clientname: {
        type: String,
        required: true // assuming client name is required
    },
    debtsdesc: {
        type: String,
        required: true // assuming debts description is required
    },
    amount: [{
        date: {
            type: String, // Consider using Date type if this represents a date
            required: true
        },
        amount: {
            type: Number, // Changed to Number type
            required: true
        }
    }]
}, {timestamps: true});

module.exports = mongoose.model("Debts", DebtsSchema);
