const mongoose = require('mongoose');
const { Schema } = mongoose;

const redeemCodeSchema = new Schema({
    code: {
        type: String,
        required: [true, 'Please provide a code'],
        unique: true,
        uppercase: true,
        trim: true
    },
    amount: {
        type: Number,
        required: [true, 'Please specify an amount for this code']
    },
    isUsed: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    usedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    usedAt: {
        type: Date
    }
}, { timestamps: true });

module.exports = mongoose.model('RedeemCode', redeemCodeSchema);