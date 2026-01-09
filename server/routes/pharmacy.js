const express = require('express');
const router = express.Router();
const Medication = require('../models/medication');
const Pharmacy = require('../models/pharmacy');
const { protect, authorize } = require('../middleware/auth');

// @desc    Get all medications (optionally filtered by hospital)
// @route   GET /api/pharmacy
// @access  Public
router.get('/', async (req, res) => {
    try {
        const { hospitalId, search } = req.query;
        let query = {};

        if (hospitalId) {
            const pharmacy = await Pharmacy.findOne({ hospital: hospitalId });
            if (pharmacy) {
                query.pharmacy = pharmacy._id;
            } else {
                // If hospital has no pharmacy, return empty list
                return res.status(200).json([]);
            }
        }

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        const medications = await Medication.find(query).populate({
            path: 'pharmacy',
            select: 'name address hospital distance',
            populate: {
                path: 'hospital',
                select: 'name'
            }
        });
        res.status(200).json(medications);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get all pharmacies
// @route   GET /api/pharmacy/list
// @access  Public
router.get('/list', async (req, res) => {
    try {
        const pharmacies = await Pharmacy.find({}).populate('hospital', 'name');
        res.status(200).json(pharmacies);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});


// @desc    Create a new pharmacy
// @route   POST /api/pharmacy/pharmacies
// @access  Private (Admins only)
router.post('/pharmacies', protect, authorize('hospital manager', 'super admin'), async (req, res) => {
    try {
        const pharmacy = await Pharmacy.create(req.body);
        res.status(201).json(pharmacy);
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: 'Error creating pharmacy' });
    }
});

// @desc    Create a new medication
// @route   POST /api/pharmacy
// @access  Private (Admins only)
router.post('/', protect, authorize('hospital manager', 'super admin'), async (req, res) => {
    try {
        const medication = await Medication.create(req.body);
        res.status(201).json(medication);
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: 'Please provide all required medication fields' });
    }
});

// @desc    Update a medication
// @route   PUT /api/pharmacy/:id
// @access  Private (Admins only)
router.put('/:id', protect, authorize('hospital manager', 'super admin'), async (req, res) => {
    try {
        const medication = await Medication.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        if (!medication) {
            return res.status(404).json({ error: 'Medication not found' });
        }
        res.status(200).json(medication);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Delete a medication
// @route   DELETE /api/pharmacy/:id
// @access  Private (Admins only)
router.delete('/:id', protect, authorize('hospital manager', 'super admin'), async (req, res) => {
    try {
        const medication = await Medication.findById(req.params.id);
        if (!medication) {
            return res.status(404).json({ error: 'Medication not found' });
        }
        await medication.deleteOne();
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
