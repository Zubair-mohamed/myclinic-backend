const mongoose = require('mongoose');
const { Schema } = mongoose;

const appointmentSchema = new Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    doctor: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true 
    },
    hospital: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true
    },
    appointmentType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AppointmentType',
        required: true
    },
    date: { type: String, required: true }, // Using string for simplicity, can be Date type
    time: { type: String, required: true },
    status: {
        type: String,
        required: true,
        // Added 'NoShow' to track prediction accuracy and patient reliability
        enum: ['Upcoming', 'Completed', 'Cancelled', 'NoShow', 'DoctorCancelled'],
        default: 'Upcoming'
    },
    cancellationResolution: {
        type: String,
        enum: ['Pending', 'Rescheduled', 'Refunded', 'Redirected'],
        default: 'Pending'
    },
    cost: {
        type: Number,
        required: true
    },
    isRefunded: {
        type: Boolean,
        default: false
    },
    reminderSet: {
        type: Boolean,
        default: false
    },
    queueNumber: {
        type: String
    },
    // Doctor reminder tracking
    doctorReminder24hSent: {
        type: Boolean,
        default: false
    },
    doctorReminder1hSent: {
        type: Boolean,
        default: false
    },
    doctorReminder24hSentAt: {
        type: Date
    },
    doctorReminder1hSentAt: {
        type: Date
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for reports linked to this appointment
appointmentSchema.virtual('reports', {
    ref: 'MedicalReport',
    localField: '_id',
    foreignField: 'appointment'
});

// Add a compound unique index to prevent double-booking
appointmentSchema.index({ doctor: 1, date: 1, time: 1 }, { unique: true });


module.exports = mongoose.model('Appointment', appointmentSchema);