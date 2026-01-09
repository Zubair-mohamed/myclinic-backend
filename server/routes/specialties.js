


const express = require('express');
const router = express.Router();
const Specialty = require('../models/specialty');
const User = require('../models/user');
const { protect, authorize } = require('../middleware/auth');
const mongoose = require('mongoose');

// Public route for fetching all unique specialty names
router.get('/public', async (req, res) => {
    try {
        // Updated to populate latitude and longitude to support distance calculations
        const specialties = await Specialty.find({}).populate('hospital', 'name latitude longitude');
        res.status(200).json(specialties);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});


// All subsequent routes are protected
router.use(protect);
router.use(authorize('hospital staff', 'hospital manager', 'super admin'));

// @desc    Get all specialties for the manager's hospital
// @route   GET /api/specialties
router.get('/', async (req, res) => {
    try {
        const primaryHospitalId = req.user.hospitals && req.user.hospitals.length > 0 ? req.user.hospitals[0] : null;
        if (!primaryHospitalId) {
            return res.status(400).json({ error: 'User is not associated with a hospital.' });
        }
        const specialties = await Specialty.find({ hospital: primaryHospitalId }).sort({ name: 1 });
        res.status(200).json(specialties);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Create a new specialty
// @route   POST /api/specialties
router.post('/', async (req, res) => {
    try {
        const { name } = req.body;
        const hospital = req.user.hospitals && req.user.hospitals.length > 0 ? req.user.hospitals[0] : null;
        if (!name || !hospital) {
            return res.status(400).json({ error: 'Specialty name and hospital are required.' });
        }
        const i18nName = { en: name, ar: name };
        // Check for duplicates within the same hospital
        const existing = await Specialty.findOne({ "name.en": name, hospital });
        if (existing) {
            return res.status(400).json({ error: 'This specialty already exists in your hospital.' });
        }
        const specialty = await Specialty.create({ name: i18nName, hospital });
        res.status(201).json(specialty);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Update a specialty
// @route   PUT /api/specialties/:id
router.put('/:id', async (req, res) => {
    try {
        const { name } = req.body;
        const specialty = await Specialty.findById(req.params.id);
        const primaryHospitalId = req.user.hospitals && req.user.hospitals.length > 0 ? req.user.hospitals[0] : null;


        if (!specialty || specialty.hospital.toString() !== primaryHospitalId.toString()) {
            return res.status(404).json({ error: 'Specialty not found or you are not authorized.' });
        }
        
        specialty.name.en = name;
        specialty.name.ar = name;
        await specialty.save();
        res.status(200).json(specialty);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Delete a specialty
// @route   DELETE /api/specialties/:id
router.delete('/:id', async (req, res) => {
    try {
        const specialty = await Specialty.findById(req.params.id);
        const primaryHospitalId = req.user.hospitals && req.user.hospitals.length > 0 ? req.user.hospitals[0] : null;

        if (!specialty || specialty.hospital.toString() !== primaryHospitalId.toString()) {
            return res.status(404).json({ error: 'Specialty not found or you are not authorized.' });
        }

        // Unassign this specialty from all doctors before deleting
        await User.updateMany(
            { specialties: specialty._id },
            { $pull: { specialties: specialty._id } }
        );

        await specialty.deleteOne();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Assign doctors to a specialty
// @route   PUT /api/specialties/:id/assign-doctors
router.put('/:id/assign-doctors', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { doctorIds } = req.body;
        const specialtyId = req.params.id;
        const primaryHospitalId = req.user.hospitals && req.user.hospitals.length > 0 ? req.user.hospitals[0] : null;

        const specialty = await Specialty.findById(specialtyId).session(session);
        if (!specialty || specialty.hospital.toString() !== primaryHospitalId.toString()) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Specialty not found or you are not authorized.' });
        }

        // 1. Remove this specialty from all doctors in the hospital (to handle un-checking)
        await User.updateMany(
            { hospitals: primaryHospitalId, specialties: specialtyId },
            { $pull: { specialties: specialtyId } }
        ).session(session);
        
        // 2. Add this specialty to the selected doctors
        if (doctorIds && doctorIds.length > 0) {
            await User.updateMany(
                { _id: { $in: doctorIds }, hospitals: primaryHospitalId },
                { $addToSet: { specialties: specialtyId } }
            ).session(session);
        }
        
        await session.commitTransaction();
        res.status(200).json({ success: true, message: 'Assignments updated.' });

    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ error: 'Server Error' });
    } finally {
        session.endSession();
    }
});

module.exports = router;