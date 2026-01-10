const mongoose = require('mongoose');
const { Schema } = mongoose;

const i18nStringSchema = new Schema({
    en: { type: String, required: true, trim: true },
    ar: { type: String, required: true, trim: true }
}, { _id: false });

const appointmentTypeSchema = new Schema({
    name: {
        type: i18nStringSchema,
        required: true
    },
    duration: {
        type: Number, // Duration in minutes
        required: [true, 'Please provide a duration'],
        min: [5, 'Duration must be at least 5 minutes']
    },
    cost: {
        type: Number,
        required: [true, 'Please provide a cost'],
        min: [0, 'Cost cannot be negative']
    },
    hospital: {
        type: Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
    },
    specialty: {
        type: Schema.Types.ObjectId,
        ref: 'Specialty',
        required: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    }
}, { timestamps: true });

// Ensure an appointment type name is unique for a specialty within a given hospital
appointmentTypeSchema.index({ name: 1, hospital: 1, specialty: 1 }, { unique: true });

module.exports = mongoose.model('AppointmentType', appointmentTypeSchema);