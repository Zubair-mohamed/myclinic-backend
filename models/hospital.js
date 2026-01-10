
const mongoose = require('mongoose');
const { Schema } = mongoose;

const i18nStringSchema = new Schema({
    en: { type: String, required: true, trim: true },
    ar: { type: String, required: true, trim: true }
}, { _id: false });

const hospitalSchema = new Schema({
    name: {
        type: i18nStringSchema,
        required: true,
        unique: true
    },
    address: {
        type: String,
        required: [true, 'Please add an address']
    },
    city: {
        type: String,
        required: [true, 'Please add a city'],
        default: 'Tripoli'
    },
    phone: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    description: {
        type: i18nStringSchema
    },
    manager: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    refundPolicyPercentage: {
        type: Number,
        default: 100,
        min: [0, 'Refund percentage cannot be less than 0'],
        max: [100, 'Refund percentage cannot be more than 100']
    },
    latitude: {
        type: Number
    },
    longitude: {
        type: Number
    }
}, { timestamps: true });

module.exports = mongoose.model('Hospital', hospitalSchema);