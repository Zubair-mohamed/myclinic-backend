const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        required: true,
        default: 0
    },
    currency: {
        type: String,
        required: true,
        default: 'LYD'
    }
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);
