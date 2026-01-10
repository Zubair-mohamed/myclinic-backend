const mongoose = require('mongoose');
const { Schema } = mongoose;

const pharmacySchema = new Schema({
    name: {
        type: Object, // { en: String, ar: String }
        required: true
    },
    address: {
        type: String,
        required: true
    },
    hospital: {
        type: Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
    },
    distance: {
        type: String,
        default: '0 km'
    }
}, { timestamps: true });

module.exports = mongoose.model('Pharmacy', pharmacySchema);
