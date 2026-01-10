const mongoose = require('mongoose');
const { Schema } = mongoose;

const medicationSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    form: {
        type: String,
        required: true
    }, // e.g., "Tablet", "50mg Tablet"
    image: {
        type: String
    }, // Base64 or URL
    pharmacy: {
        type: Schema.Types.ObjectId,
        ref: 'Pharmacy',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Medication', medicationSchema);
