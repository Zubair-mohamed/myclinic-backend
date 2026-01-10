

const express = require('express');
const router = express.Router();
const Hospital = require('../models/hospital');
const User = require('../models/user');
const { protect, authorize } = require('../middleware/auth');


// @desc    Get all hospitals
// @route   GET /api/hospitals
// @access  Public
router.get('/', async (req, res) => {
    try {
        const hospitals = await Hospital.find({}).populate('manager', 'name email');
        res.status(200).json(hospitals);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Create a new hospital
// @route   POST /api/hospitals
// @access  Private (Super Admin)
router.post('/', protect, authorize('super admin'), async (req, res) => {
    const { name, address, manager, refundPolicyPercentage } = req.body;
    try {
        const hospital = await Hospital.create({ name: { en: name, ar: name }, address, manager, refundPolicyPercentage });
        res.status(201).json(hospital);
    } catch (error) {
        res.status(400).json({ error: 'Please provide all required fields' });
    }
});

// @desc    Update a hospital
// @route   PUT /api/hospitals/:id
// @access  Private (Super Admin)
router.put('/:id', protect, authorize('super admin'), async (req, res) => {
    const { name, address, manager, refundPolicyPercentage } = req.body;
    try {
        let hospital = await Hospital.findById(req.params.id);
        if (!hospital) {
            return res.status(404).json({ error: 'Hospital not found' });
        }

        if (name) {
            hospital.name.en = name;
            hospital.name.ar = name;
        }
        hospital.address = address || hospital.address;
        hospital.manager = manager; // Can be set to null
        if (refundPolicyPercentage !== undefined) {
            hospital.refundPolicyPercentage = refundPolicyPercentage;
        }

        await hospital.save();

        res.status(200).json(hospital);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Delete a hospital
// @route   DELETE /api/hospitals/:id
// @access  Private (Super Admin)
router.delete('/:id', protect, authorize('super admin'), async (req, res) => {
    try {
        const hospital = await Hospital.findById(req.params.id);
        if (!hospital) {
            return res.status(404).json({ error: 'Hospital not found' });
        }

        // In a real app, you would handle cascading deletes or re-assignment of users.
        // For now, we just delete the hospital record.
        await hospital.deleteOne();

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get doctors for a specific hospital
// @route   GET /api/hospitals/:id/doctors
// @access  Public
router.get('/:id/doctors', async (req, res) => {
    try {
        const hospitalId = req.params.id;

        // Find doctors who have this hospital in their hospitals array
        const doctors = await User.find({
            role: 'doctor',
            hospitals: hospitalId
        })
            .select('name email phone avatar specialties availability bio hospitals')
            .populate('specialties', 'name')
            .populate('hospitals', 'name address');

        // Map hospitals to clinics for frontend compatibility if needed
        const doctorsWithClinics = doctors.map(doc => {
            const docObj = doc.toObject();
            docObj.clinics = docObj.hospitals;
            return docObj;
        });

        res.status(200).json(doctorsWithClinics);
    } catch (error) {
        console.error('Error fetching doctors for hospital:', error);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;