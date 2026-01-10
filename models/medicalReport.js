
const mongoose = require('mongoose');
const { Schema } = mongoose;

const medicalReportSchema = new Schema({
    patient: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    appointment: {
        type: Schema.Types.ObjectId,
        ref: 'Appointment'
    },
    uploadedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    fileType: {
        type: String,
        required: true
    },
    fileData: {
        type: String, // Base64 encoded string
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
});

// Index for faster queries by patient
medicalReportSchema.index({ patient: 1, uploadedAt: -1 });

module.exports = mongoose.model('MedicalReport', medicalReportSchema);
