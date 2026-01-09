const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Schema } = mongoose;

const availabilitySchema = new Schema({
    dayOfWeek: {
        type: String,
        enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        required: true
    },
    isAvailable: { type: Boolean, default: false },
    startTime: { type: String, default: '' }, // HH:mm format
    endTime: { type: String, default: '' },   // HH:mm format
    hospital: {
        type: Schema.Types.ObjectId,
        ref: 'Hospital'
    },
    announcement: {
        type: String,
        default: '',
        trim: true
    }
});

const i18nStringSchema = new Schema({
    en: { type: String, required: true, trim: true },
    ar: { type: String, required: true, trim: true }
}, { _id: false });

const medicalProfileSchema = new Schema({
    bloodType: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'], default: 'Unknown' },
    height: { type: Number }, // in cm
    weight: { type: Number }, // in kg
    allergies: [{ type: String }],
    chronicConditions: [{ type: String }]
}, { _id: false });

const UserSchema = new mongoose.Schema({
    name: {
        type: i18nStringSchema,
        required: true
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/,
            'Please add a valid email'
        ]
    },
    phone: {
        type: String,
        required: [true, 'Please add a phone number'],
        match: [
            /^(?:\+218|0)?\s?9[12345]\s?\d{3}\s?\d{4}$/,
            'Please add a valid Libyan phone number, e.g., 091, 092, 093, 094, or 095 followed by 7 digits'
        ]
    },
    age: {
        type: Number
    },
    dateOfBirth: {
        type: Date
    },
    role: {
        type: String,
        enum: ['super admin', 'hospital manager', 'hospital staff', 'doctor', 'patient'],
        default: 'patient'
    },
    fcmToken: {
        type: String,
        default: null
    },
    fcmTokenUpdatedAt: {
        type: Date,
        default: null
    },
    notificationPreferences: {
        push: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false }
    },
    hospitals: [{
        type: Schema.Types.ObjectId,
        ref: 'Hospital'
    }],
    specialties: [{
        type: Schema.Types.ObjectId,
        ref: 'Specialty'
    }],
    favoriteHospitals: [{
        type: Schema.Types.ObjectId,
        ref: 'Hospital'
    }],
    favoriteDoctors: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other', 'Unknown'],
        default: 'Unknown'
    },
    password: {
        type: String,
        required: [true, 'Please add a password'],
        minlength: [8, 'Password must be at least 8 characters long'],
        validate: {
            validator: function(v) {
                // Requires at least one lower case, one upper case, and one number
                return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(v);
            },
            message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number.'
        },
        select: false // Don't return password by default
    },
    availability: {
        type: [availabilitySchema],
        default: () => [
            { dayOfWeek: 'Sunday', isAvailable: false, announcement: '', startTime: '', endTime: '' },
            { dayOfWeek: 'Monday', isAvailable: false, announcement: '', startTime: '', endTime: '' },
            { dayOfWeek: 'Tuesday', isAvailable: false, announcement: '', startTime: '', endTime: '' },
            { dayOfWeek: 'Wednesday', isAvailable: false, announcement: '', startTime: '', endTime: '' },
            { dayOfWeek: 'Thursday', isAvailable: false, announcement: '', startTime: '', endTime: '' },
            { dayOfWeek: 'Friday', isAvailable: false, announcement: '', startTime: '', endTime: '' },
            { dayOfWeek: 'Saturday', isAvailable: false, announcement: '', startTime: '', endTime: '' },
        ]
    },
    medicalProfile: {
        type: medicalProfileSchema,
        default: () => ({})
    },
    passwordResetOtp: String,
    passwordResetOtpExpire: Date,
    registrationOtp: String,
    registrationOtpExpire: Date,
    isActive: {
        type: Boolean,
        default: false
    },
    isDisabled: {
        type: Boolean,
        default: false
    },
    disabledAt: Date,
    disabledReason: String,
    disabledBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    reactivationOtp: String,
    reactivationOtpExpire: Date,
    unavailabilityEpisodes: [{
        startDate: Date,
        endDate: Date,
        reason: String,
        createdAt: { type: Date, default: Date.now }
    }],
    avatar: {
        type: String
    }
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function() {
    return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '30d'
    });
};

// Sign a short-lived token for the password reset process
UserSchema.methods.getResetPasswordToken = function() {
    return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
        expiresIn: '10m' // A short-lived token
    });
};

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);