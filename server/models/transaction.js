const mongoose = require('mongoose');
const { Schema } = mongoose;

const transactionSchema = new Schema({
    wallet: {
        type: Schema.Types.ObjectId,
        ref: 'Wallet',
        required: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    hospital: {
        type: Schema.Types.ObjectId,
        ref: 'Hospital'
    },
    amount: { 
        type: Number, 
        required: true 
    },
    type: {
        type: String,
        required: true,
        enum: ['credit', 'debit']
    },
    transactionType: {
        type: String,
        required: true,
        enum: ['Appointment Fee', 'Refund', 'Deposit', 'Admin Credit', 'Initial Balance']
    },
    status: {
        type: String,
        required: true,
        enum: ['Completed', 'Pending', 'Failed'],
        default: 'Completed'
    },
    description: {
        type: String,
        required: true
    },
    referenceId: { // e.g., Appointment ID or RedeemCode ID
        type: String,
        required: true
    }
}, { timestamps: true });

transactionSchema.index({ wallet: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);