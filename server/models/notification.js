const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: { type: Schema.Types.Mixed }, // Can be String or { en: String, ar: String }
    message: { type: Schema.Types.Mixed, required: true }, // Can be String or { en: String, ar: String }
    type: { 
        type: String, 
        enum: ['appointment', 'reminder', 'wallet', 'system', 'emergency'], 
        required: true 
    },
    priority: {
        type: String,
        enum: ['normal', 'high'],
        default: 'normal'
    },
    link: { type: String, default: '#' }, // Link to the relevant page, currently unused
    isRead: { type: Boolean, default: false },
}, { timestamps: true }); // Use Mongoose timestamps for createdAt/updatedAt

module.exports = mongoose.model('Notification', notificationSchema);
