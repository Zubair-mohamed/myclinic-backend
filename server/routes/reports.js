
const express = require('express');
const router = express.Router();
const MedicalReport = require('../models/medicalReport');
const User = require('../models/user'); // Import User model
const { protect, authorize } = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail'); // Import email utility

// All routes are protected
router.use(protect);

// @desc    Upload a medical report
// @route   POST /api/reports
// @access  Private (Patient or Doctor/Staff acting on behalf)
router.post('/', async (req, res) => {
    try {
        const { title, description, fileData, fileType, patientId, appointmentId } = req.body;

        if (!title || !fileData || !fileType) {
            return res.status(400).json({ error: 'Please provide title and file.' });
        }

        // Basic size check (approximate for base64)
        // 10MB limit roughly equals 13.7MB in base64
        if (fileData.length > 14 * 1024 * 1024) {
             return res.status(400).json({ error: 'File too large. Limit is 10MB.' });
        }

        // Determine target patient
        let targetPatientId = req.user._id;
        
        // If a doctor/admin is uploading for a specific patient
        if (patientId && ['doctor', 'hospital staff', 'hospital manager', 'super admin'].includes(req.user.role)) {
            targetPatientId = patientId;
        }

        const report = await MedicalReport.create({
            patient: targetPatientId,
            appointment: appointmentId,
            uploadedBy: req.user._id, // Track who uploaded it
            title,
            description,
            fileData,
            fileType
        });

        // --- EMAIL NOTIFICATION LOGIC ---
        // If a doctor uploaded this, send email to patient
        if (req.user.role === 'doctor' && targetPatientId !== req.user._id) {
            try {
                const patient = await User.findById(targetPatientId);
                if (patient && patient.email) {
                    await sendEmail({
                        email: patient.email,
                        type: 'medical_report',
                        data: {
                            title: title,
                            description: description,
                            date: new Date().toLocaleDateString(),
                            doctorName: req.user.name.en
                        }
                    });
                }
            } catch (emailErr) {
                console.error("Failed to send email notification:", emailErr);
                // Don't fail the request if email fails, just log it
            }
        }
        // -------------------------------

        res.status(201).json(report);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get reports for a specific patient
// @route   GET /api/reports/patient/:patientId
// @access  Private (Patient owner or Doctor/Admin)
router.get('/patient/:patientId', async (req, res) => {
    try {
        const patientId = req.params.patientId;

        // Authorization check
        // Patients can only see their own reports
        if (req.user.role === 'patient' && req.user._id.toString() !== patientId) {
            return res.status(403).json({ error: 'Not authorized to view these reports.' });
        }
        
        // Doctors, Staff, Admins can view reports
        if (['doctor', 'hospital staff', 'hospital manager', 'super admin'].includes(req.user.role) === false && req.user.role !== 'patient') {
             return res.status(403).json({ error: 'Not authorized.' });
        }

        const reports = await MedicalReport.find({ patient: patientId })
            .populate('uploadedBy', 'name role') // Populate uploader details
            .sort({ uploadedAt: -1 });
            
        res.json(reports);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Delete a report
// @route   DELETE /api/reports/:id
// @access  Private (Owner or Admin)
router.delete('/:id', async (req, res) => {
    try {
        const report = await MedicalReport.findById(req.params.id);

        if (!report) {
            return res.status(404).json({ error: 'Report not found.' });
        }

        // Allow deletion if:
        // 1. User uploaded it themselves
        // 2. User is Super Admin
        const isUploader = report.uploadedBy.toString() === req.user._id.toString();
        const isPatientOwner = report.patient.toString() === req.user._id.toString();
        const isSuperAdmin = req.user.role === 'super admin';

        // Patient can delete own files or files uploaded by them. 
        // Strict mode: Only uploader can delete? Let's allow patient to delete anything in their record for privacy control, 
        // OR restrict deletion of Doctor notes. For now, assuming standard permission:
        if (!isUploader && !isSuperAdmin && !(isPatientOwner && report.uploadedBy.toString() === report.patient.toString())) {
             return res.status(403).json({ error: 'Not authorized to delete this report.' });
        }

        await report.deleteOne();
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
