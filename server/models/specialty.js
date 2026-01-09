const mongoose = require('mongoose');
const { Schema } = mongoose;

const i18nStringSchema = new Schema({
    en: { type: String, required: true, trim: true },
    ar: { type: String, required: true, trim: true }
}, { _id: false });

const specialtySchema = new Schema({
    name: {
        type: i18nStringSchema,
        required: true
    },
    hospital: {
        type: Schema.Types.ObjectId,
        ref: 'Hospital',
        required: true,
    }
}, { timestamps: true });

// Ensure a specialty name is unique within a given hospital
specialtySchema.index({ "name.en": 1, hospital: 1 }, { unique: true });
specialtySchema.index({ "name.ar": 1, hospital: 1 }, { unique: true });

module.exports = mongoose.model('Specialty', specialtySchema);