const mongoose = require('mongoose');
const { Schema } = mongoose;

const queueItemSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    walkInName: {
        type: String,
        trim: true
    },
    doctor: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    hospital: {
        type: Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
    },
    queueNumber: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Waiting', 'Serving', 'Held', 'Done', 'Left', 'RemovedByAdmin'],
        default: 'Waiting'
    },
    checkInTime: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Index for efficient querying of a doctor's waiting queue
queueItemSchema.index({ doctor: 1, status: 1 });

// Index for fetching a user's history
queueItemSchema.index({ user: 1 });


module.exports = mongoose.model('QueueItem', queueItemSchema);