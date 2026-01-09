const mongoose = require('mongoose');

const PendingUserSchema = new mongoose.Schema({
    name: {
        type: Object, // { en: string, ar: string }
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    age: {
        type: Number
    },
    role: {
        type: String,
        default: 'patient'
    },
    otp: {
        type: String,
        required: true
    },
    otpExpire: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600 // Auto-delete after 10 minutes
    }
});

module.exports = mongoose.model('PendingUser', PendingUserSchema);
