
const express = require('express');
const router = express.Router();
const AppointmentType = require('../models/appointmentType');
const { protect, authorize } = require('../middleware/auth');

// @desc    Get all public appointment types
// @route   GET /api/appointment-types/public
// @access  Public
router.get('/public', async (req, res) => {
    try {
        const types = await AppointmentType.find({}).populate('specialty', 'name');
        res.status(200).json(types);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get all public appointment types filtered by specialty and hospital
// @route   GET /api/appointment-types/by-spec-hosp
// @access  Public
router.get('/by-spec-hosp', async (req, res) => {
    try {
        const { specialtyId, hospitalId } = req.query;
        if (!specialtyId || !hospitalId) {
            return res.status(400).json({ error: 'Specialty ID and Hospital ID are required.' });
        }
        const types = await AppointmentType.find({ specialty: specialtyId, hospital: hospitalId }).populate('specialty', 'name');
        res.status(200).json(types);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});


// All subsequent routes are protected
router.use(protect);

// @desc    Get all appointment types for the manager's/staff's hospital
// @route   GET /api/appointment-types
router.get('/', authorize('hospital manager', 'super admin', 'hospital staff'), async (req, res) => {
    try {
        const primaryHospitalId = req.user.hospitals && req.user.hospitals.length > 0 ? req.user.hospitals[0] : null;
        if (!primaryHospitalId) {
            return res.status(400).json({ error: 'User is not associated with a hospital.' });
        }
        const types = await AppointmentType.find({ hospital: primaryHospitalId }).populate('specialty', 'name').sort({ name: 1 });
        res.status(200).json(types);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Create a new appointment type
// @route   POST /api/appointment-types
router.post('/', authorize('hospital manager', 'super admin', 'hospital staff'), async (req, res) => {
    try {
        const { name, duration, cost, specialty } = req.body;
        const hospital = req.user.hospitals && req.user.hospitals.length > 0 ? req.user.hospitals[0] : null;
        
        if (!name || !duration || cost === undefined || !specialty || !hospital) {
            return res.status(400).json({ error: 'All fields are required.' });
        }
        
        const i18nName = { en: name, ar: name };
        const existing = await AppointmentType.findOne({ "name.en": name, hospital });
        if (existing) {
            return res.status(400).json({ error: 'This appointment type already exists in your hospital.' });
        }
        
        const appointmentType = await AppointmentType.create({
            name: i18nName,
            duration,
            cost,
            specialty,
            hospital,
            createdBy: req.user._id,
        });

        const populatedType = await AppointmentType.findById(appointmentType._id).populate('specialty', 'name');
        res.status(201).json(populatedType);

    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Update an appointment type (price/duration/specialty) while preserving identity
// @route   PUT /api/appointment-types/:id
router.put('/:id', authorize('hospital manager', 'super admin', 'hospital staff'), async (req, res) => {
    try {
        const { name, duration, cost, specialty, allowNameChange } = req.body;
        const type = await AppointmentType.findById(req.params.id);
        const primaryHospitalId = req.user.hospitals && req.user.hospitals.length > 0 ? req.user.hospitals[0] : null;

        if (!type || type.hospital.toString() !== primaryHospitalId.toString()) {
            return res.status(404).json({ error: 'Appointment type not found or you are not authorized.' });
        }

        // Basic validation to prevent nonsensical updates
        if (cost === undefined || cost === null || Number(cost) < 0) {
            return res.status(400).json({ error: 'Cost must be zero or greater.' });
        }
        if (duration !== undefined && duration !== null && Number(duration) <= 0) {
            return res.status(400).json({ error: 'Duration must be greater than zero.' });
        }

        const updatedFields = {
            cost: Number(cost),
        };

        if (duration !== undefined && duration !== null) {
            updatedFields.duration = Number(duration);
        }

        if (specialty) {
            updatedFields.specialty = specialty;
        }

        // Name changes are blocked unless explicitly allowed and different
        const requestedName = typeof name === 'string' ? name.trim() : null;
        const currentName = type.name?.en;

        if (requestedName && requestedName !== currentName) {
            if (!allowNameChange) {
                return res.status(400).json({ error: 'Name change is not allowed without explicit confirmation.' });
            }

            // Prevent duplicates when renaming
            const duplicate = await AppointmentType.findOne({
                "name.en": requestedName,
                hospital: primaryHospitalId,
                specialty: specialty || type.specialty,
                _id: { $ne: type._id }
            });
            if (duplicate) {
                return res.status(400).json({ error: 'Another service with this name already exists in this hospital.' });
            }

            updatedFields.name = { en: requestedName, ar: requestedName };
        }

        const updatedType = await AppointmentType.findByIdAndUpdate(
            req.params.id,
            updatedFields,
            { new: true, runValidators: true }
        ).populate('specialty', 'name');

        res.status(200).json(updatedType);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Server Error' });
    }
});

// @desc    Delete an appointment type
// @route   DELETE /api/appointment-types/:id
router.delete('/:id', authorize('hospital manager', 'super admin', 'hospital staff'), async (req, res) => {
    try {
        const type = await AppointmentType.findById(req.params.id);
        const primaryHospitalId = req.user.hospitals && req.user.hospitals.length > 0 ? req.user.hospitals[0] : null;

        if (!type || type.hospital.toString() !== primaryHospitalId.toString()) {
            return res.status(404).json({ error: 'Appointment type not found or you are not authorized.' });
        }
        
        await type.deleteOne();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
