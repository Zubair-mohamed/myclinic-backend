const mongoose = require('mongoose');
const { Schema } = mongoose;

const reminderSchema = new Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    medication: { type: String, required: true },
    dosage: { type: String, required: true },
    time: { type: String, required: true },
    period: {
        type: String,
        required: true,
        enum: ['Morning', 'Afternoon', 'Evening']
    }
});

module.exports = mongoose.model('Reminder', reminderSchema);
