const mongoose = require('mongoose');
const { Schema } = mongoose;

const emergencyContactSchema = new Schema({
    user: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    name: { 
        type: String, 
        required: [true, 'Please add a contact name'] 
    },
    relation: { 
        type: String, 
        required: [true, 'Please add the relation'] 
    },
    phone: { 
        type: String, 
        required: [true, 'Please add a phone number'] 
    },
}, { timestamps: true });

// Add index for faster lookups by user
emergencyContactSchema.index({ user: 1 });

module.exports = mongoose.model('EmergencyContact', emergencyContactSchema);
