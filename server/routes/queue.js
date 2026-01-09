const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const queueService = require('../services/queueService');

const localeText = (req, key) => {
    const locale = req.locale || 'en';
    const dict = {
        serverError: { en: 'Server Error', ar: 'خطأ في الخادم' },
        queueDataError: { en: 'Failed to load queue data.', ar: 'فشل في تحميل بيانات الطابور.' },
        alreadyQueued: { en: 'You are already in a queue.', ar: 'أنت بالفعل في طابور.' }
    };
    const entry = dict[key];
    return entry ? (entry[locale] || entry.en) : key;
};

// All routes are protected
router.use(protect);

// --- PATIENT-FACING ROUTES ---

// @desc    Get user's queue status, available doctors, and today's appointments
// @route   GET /api/queue/status
// @access  Private (Patient)
router.get('/status', authorize('patient'), async (req, res) => {
    try {
        const { _id: userId, hospitals: userHospitals } = req.user;
        const data = await queueService.getPatientQueueStatus(userId, userHospitals);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message || localeText(req, 'serverError') });
    }
});

// @desc    Get user's queue history
// @route   GET /api/queue/history
// @access  Private (Patient)
router.get('/history', authorize('patient'), async (req, res) => {
    try {
        const history = await queueService.getQueueHistory(req.user._id);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message || localeText(req, 'serverError') });
    }
});


// --- ADMIN/STAFF-FACING ROUTES ---

// @desc    Get initial queue data for an admin view
// @route   GET /api/queue/admin/init
// @access  Private (Admins)
router.get('/admin/init', authorize('doctor', 'hospital staff', 'hospital manager', 'super admin'), async (req, res) => {
    try {
        const data = await queueService.getAdminQueueInitData(req.user);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message || localeText(req, 'queueDataError') });
    }
});

// @desc    Get queue for a specific doctor
// @route   GET /api/queue/doctor/:doctorId
// @access  Private (Doctor, Staff, Manager, Admin)
router.get('/doctor/:doctorId', authorize('doctor', 'hospital staff', 'hospital manager', 'super admin'), async (req, res) => {
    try {
        const { doctorId } = req.params;
        const data = await queueService.getDoctorQueue(doctorId, req.user);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message || localeText(req, 'serverError') });
    }
});


// --- ACTION ROUTES ---

// @desc    Patient joins a doctor's queue for a specific hospital
// @route   POST /api/queue/join
// @access  Private (Patient)
router.post('/join', authorize('patient'), async (req, res) => {
    try {
        const { doctorId, hospitalId } = req.body;
        const result = await queueService.joinQueue(req.user._id, doctorId, hospitalId);
        res.status(201).json(result);
    } catch (error) {
        const statusCode = error.message === 'You are already in a queue.' ? 400 : 500;
        const fallback = error.message === 'You are already in a queue.' ? localeText(req, 'alreadyQueued') : localeText(req, 'serverError');
        res.status(statusCode).json({ error: error.message || fallback });
    }
});


// @desc    Patient leaves a queue
// @route   DELETE /api/queue/leave
// @access  Private (Patient)
router.delete('/leave', authorize('patient'), async (req, res) => {
    try {
        const result = await queueService.leaveQueue(req.user._id);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message || localeText(req, 'serverError') });
    }
});

// @desc    Admin calls the next patient for a doctor
// @route   POST /api/queue/next/:doctorId
// @access  Private (Admins)
router.post('/next/:doctorId', authorize('doctor', 'hospital staff', 'hospital manager', 'super admin'), async (req, res) => {
     try {
        const { doctorId } = req.params;
        const nextPatient = await queueService.callNextPatient(doctorId);
        res.status(200).json(nextPatient);
    } catch (error) {
        res.status(500).json({ error: error.message || localeText(req, 'serverError') });
    }
});

// @desc    Admin holds a patient (missed turn)
// @route   POST /api/queue/hold/:queueItemId
// @access  Private (Admins)
router.post('/hold/:queueItemId', authorize('doctor', 'hospital staff', 'hospital manager', 'super admin'), async (req, res) => {
    try {
       const { queueItemId } = req.params;
       const result = await queueService.holdPatient(queueItemId);
       res.status(200).json(result);
   } catch (error) {
           res.status(500).json({ error: error.message || localeText(req, 'serverError') });
   }
});

// @desc    Admin re-queues a held patient
// @route   POST /api/queue/requeue/:queueItemId
// @access  Private (Admins)
router.post('/requeue/:queueItemId', authorize('doctor', 'hospital staff', 'hospital manager', 'super admin'), async (req, res) => {
    try {
       const { queueItemId } = req.params;
       const result = await queueService.requeuePatient(queueItemId);
       res.status(200).json(result);
   } catch (error) {
           res.status(500).json({ error: error.message || localeText(req, 'serverError') });
   }
});


// @desc    Admin adds a walk-in patient to a specific doctor
// @route   POST /api/queue/walk-in/:doctorId
// @access  Private (Admins)
router.post('/walk-in/:doctorId', authorize('hospital manager', 'super admin'), async (req, res) => {
    try {
        const { name } = req.body;
        const { doctorId } = req.params;
        const result = await queueService.addWalkInPatient(name, doctorId);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message || localeText(req, 'serverError') });
    }
});

// @desc    Admin adds a walk-in patient by specialty (shortest queue)
// @route   POST /api/queue/walk-in/specialty
// @access  Private (Admins)
router.post('/walk-in/specialty', authorize('hospital staff', 'hospital manager', 'super admin'), async (req, res) => {
    try {
        const { name, specialtyId } = req.body;
        const result = await queueService.addWalkInBySpecialty(name, specialtyId, req.user);
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message || localeText(req, 'serverError') });
    }
});

// @desc    Admin/Staff checks in a scheduled appointment
// @route   POST /api/queue/check-in
// @access  Private (Admins/Doctors)
router.post('/check-in', authorize('doctor', 'hospital staff', 'hospital manager', 'super admin'), async (req, res) => {
    try {
        const { appointmentId } = req.body;
        const result = await queueService.checkInAppointment(appointmentId);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message || localeText(req, 'serverError') });
    }
});


// @desc    Admin removes a patient from the queue
// @route   DELETE /api/queue/remove/:queueItemId
// @access  Private (Admins)
router.delete('/remove/:queueItemId', authorize('doctor', 'hospital staff', 'hospital manager', 'super admin'), async (req, res) => {
    try {
        const { queueItemId } = req.params;
        const result = await queueService.removePatientFromQueue(queueItemId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message || localeText(req, 'serverError') });
    }
});


module.exports = router;