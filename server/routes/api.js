
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // Ensure mongoose is required for ObjectId
const { protect, authorize } = require('../middleware/auth');

// Import models
const Appointment = require('../models/appointment');
const Reminder = require('../models/reminder');
const Wallet = require('../models/wallet');
const Notification = require('../models/notification');
const User = require('../models/user');
const QueueItem = require('../models/queueItem');
const EmergencyContact = require('../models/emergencyContact');
const MedicalReport = require('../models/medicalReport'); // Added import

// Import existing route files
const authRoutes = require('./auth');
const userRoutes = require('./users');
const hospitalRoutes = require('./hospitals');
const pharmacyRoutes = require('./pharmacy');
const walletRoutes = require('./wallet');
const specialtyRoutes = require('./specialties');
const queueRoutes = require('./queue');
const appointmentRoutes = require('./appointments');
const appointmentTypeRoutes = require('./appointmentTypes');
const analyticsRoutes = require('./analytics');
const reportRoutes = require('./reports');
const aiRoutes = require('./ai');

// @desc    Health check
// @route   GET /api/health
// @access  Public
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount existing routers
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/hospitals', hospitalRoutes);
router.use('/pharmacy', pharmacyRoutes);
router.use('/wallet', walletRoutes);
router.use('/specialties', specialtyRoutes);
router.use('/queue', queueRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/appointment-types', appointmentTypeRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/reports', reportRoutes);
router.use('/ai', aiRoutes);


// --- Additional API routes required by the frontend ---

// @desc    Get dashboard data
// @route   GET /api/dashboard
// @access  Private
router.get('/dashboard', protect, async (req, res) => {
    try {
        const { role, _id, hospitals } = req.user;
        let data = {};
        const today = new Date().toISOString().split('T')[0];

        if (role === 'patient') {
            // Fetch upcoming appointments (list)
            const upcomingAppointmentsList = await Appointment.find({ user: _id, status: 'Upcoming' })
                .sort({ date: 1, time: 1 })
                .limit(5)
                .populate('doctor', 'name availability')
                .populate('hospital', 'name');

            // Use the first one for the 'next appointment' card
            const upcomingAppointment = upcomingAppointmentsList.length > 0 ? upcomingAppointmentsList[0] : null;

            const nextReminder = await Reminder.findOne({ user: _id }).sort({ time: 1 });
            const wallet = await Wallet.findOne({ user: _id });
            const todaysReminders = await Reminder.find({ user: _id }).sort({ period: 1, time: 1 }).limit(3);

            data = { 
                upcomingAppointment, 
                upcomingAppointmentsList, 
                nextReminder, 
                walletBalance: wallet?.balance || 0, 
                todaysReminders,
                user: {
                    avatar: req.user.avatar,
                    name: req.user.name,
                    email: req.user.email
                }
            };
        } else if (role === 'doctor') {
            const todaysAppointments = await Appointment.countDocuments({ doctor: _id, date: today });
            const nextPatientRaw = await Appointment.findOne({ doctor: _id, status: 'Upcoming', date: today })
                .sort({ time: 1 })
                .populate('user', 'name');
            
            let nextPatient = null;
            if (nextPatientRaw) {
                nextPatient = nextPatientRaw.toObject();
                nextPatient.patient = nextPatient.user; // Map user to patient for frontend compatibility
            }

            // Fetch current queue for the doctor
            const currentQueue = await QueueItem.find({ 
                doctor: _id, 
                status: { $in: ['Waiting', 'Serving'] } 
            })
            .sort({ checkInTime: 1 })
            .populate('user', 'name');
            
            data = { todaysAppointments, nextPatient, currentQueue };
        } else { // Admin roles
            const primaryHospitalId = hospitals && hospitals.length > 0 ? hospitals[0] : null;

            // If no hospital is assigned to this admin/staff, return basic stats to prevent crash
            if (!primaryHospitalId && role !== 'super admin') {
                return res.status(200).json({
                    totalAppointmentsToday: 0,
                    totalPatients: 0,
                    totalRevenueToday: 0,
                    appointmentsBySpecialty: [],
                    latestAppointments: [],
                    appointmentsByStatus: [],
                    revenueOverLast7Days: []
                });
            }

            // For super admin with no specific hospital context, we might want global stats, 
            // but for now, let's guard against the aggregation crash.
            let matchStage = { date: today };
            if (primaryHospitalId) {
                matchStage.hospital = new mongoose.Types.ObjectId(primaryHospitalId);
            }

            const appointmentsToday = await Appointment.find(matchStage);
            const totalAppointmentsToday = appointmentsToday.length;

            const totalPatientsQuery = { role: 'patient' };
            if (primaryHospitalId) {
                totalPatientsQuery.hospitals = primaryHospitalId;
            }
            const totalPatients = await User.countDocuments(totalPatientsQuery);

            const completedAppointmentsToday = appointmentsToday.filter(a => a.status === 'Completed');
            const totalRevenueToday = completedAppointmentsToday.reduce((sum, appt) => sum + appt.cost, 0);

            const statusCounts = appointmentsToday.reduce((acc, appt) => {
                acc[appt.status] = (acc[appt.status] || 0) + 1;
                return acc;
            }, {});
            const appointmentsByStatus = Object.keys(statusCounts).map(status => ({
                name: status,
                value: statusCounts[status]
            }));

            // Only run aggregation if we have a hospital ID to filter by, or handle globally
            let appointmentsBySpecialty = [];
            if (primaryHospitalId) {
                appointmentsBySpecialty = await Appointment.aggregate([
                    { $match: { hospital: new mongoose.Types.ObjectId(primaryHospitalId), date: today } },
                    { $lookup: { from: 'appointmenttypes', localField: 'appointmentType', foreignField: '_id', as: 'type' } },
                    { $unwind: '$type' },
                    { $lookup: { from: 'specialties', localField: 'type.specialty', foreignField: '_id', as: 'specialtyInfo' } },
                    { $unwind: '$specialtyInfo' },
                    { $group: { _id: '$specialtyInfo.name', count: { $sum: 1 } } },
                    { $project: { name: '$_id', count: 1, _id: 0 } },
                    { $sort: { count: -1 } }
                ]);
            }

            const latestAppointmentsQuery = primaryHospitalId ? { hospital: primaryHospitalId } : {};
            const latestAppointments = await Appointment.find(latestAppointmentsQuery)
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('user', 'name')
                .populate('doctor', 'name');

            // Revenue over last 7 days
            const dates = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                dates.push(d.toISOString().split('T')[0]);
            }

            let revenueOverLast7Days = [];
            if (primaryHospitalId) {
                const revenueData = await Appointment.aggregate([
                    {
                        $match: {
                            hospital: new mongoose.Types.ObjectId(primaryHospitalId),
                            status: 'Completed',
                            date: { $in: dates }
                        }
                    },
                    {
                        $group: {
                            _id: '$date',
                            revenue: { $sum: '$cost' }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]);
                const revenueMap = new Map(revenueData.map(item => [item._id, item.revenue]));
                revenueOverLast7Days = dates.map(date => ({
                    date: date,
                    revenue: revenueMap.get(date) || 0
                }));
            }

            data = { totalAppointmentsToday, totalPatients, totalRevenueToday, appointmentsBySpecialty, latestAppointments, appointmentsByStatus, revenueOverLast7Days };
        }
        res.json(data);
    } catch (error) {
        console.error('Dashboard Error:', error); // Log the error for debugging
        res.status(500).json({ error: 'Server Error: ' + error.message });
    }
});

// @desc    Get patient's full medical history
// @route   GET /api/patient/history/:patientId?
// @access  Private
router.get('/patient/history/:patientId?', protect, async (req, res) => {
    try {
        let targetUserId = req.user._id;

        // If a patientId is provided and the requester is NOT that patient, check authorization
        if (req.params.patientId && req.params.patientId !== req.user._id.toString()) {
            // Doctors/Admins can view other patients
            if (['doctor', 'hospital staff', 'hospital manager', 'super admin'].includes(req.user.role)) {
                targetUserId = req.params.patientId;
            } else {
                return res.status(403).json({ error: 'Not authorized to view this patient history.' });
            }
        }

        const [userProfile, reports, pastAppointments] = await Promise.all([
            User.findById(targetUserId).select('name email phone medicalProfile'),
            MedicalReport.find({ patient: targetUserId })
                .populate('uploadedBy', 'name role') // Populate the uploader info to ensure visibility logic works
                .sort({ uploadedAt: -1 }),
            Appointment.find({ user: targetUserId, status: 'Completed' })
                .sort({ date: -1 })
                .populate('doctor', 'name')
                .populate('hospital', 'name')
                .populate('appointmentType', 'name')
        ]);

        res.json({
            profile: userProfile,
            reports,
            appointments: pastAppointments
        });

    } catch (error) {
        console.error('History Error:', error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get all reminders for a user
// @route   GET /api/reminders
// @access  Private (patient only)
router.get('/reminders', protect, authorize('patient'), async (req, res) => {
    try {
        const reminders = await Reminder.find({ user: req.user._id }).sort({ period: 1, time: 1 });
        res.json(reminders);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Create a reminder
// @route   POST /api/reminders
// @access  Private (patient only)
router.post('/reminders', protect, authorize('patient'), async (req, res) => {
    try {
        const { medication, dosage, time, period } = req.body;
        const reminder = await Reminder.create({ user: req.user._id, medication, dosage, time, period });
        res.status(201).json(reminder);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Delete a reminder
// @route   DELETE /api/reminders/:id
// @access  Private (patient only)
router.delete('/reminders/:id', protect, authorize('patient'), async (req, res) => {
    try {
        const reminder = await Reminder.findOne({ _id: req.params.id, user: req.user._id });
        if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
        await reminder.deleteOne();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get notifications for a user
// @route   GET /api/notifications
// @access  Private
router.get('/notifications', protect, async (req, res) => {
    try {
        const lang = req.headers['accept-language']?.split(',')[0]?.split('-')[0] || req.user.language || 'en';
        const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
        
        const formattedNotifications = notifications.map(n => {
            const obj = n.toObject();
            
            // Handle localized title
            let title = obj.title;
            if (typeof title === 'object' && title !== null) {
                title = title[lang] || title.en || title.ar || '';
            }
            
            // Handle localized message
            let message = obj.message;
            if (typeof message === 'object' && message !== null) {
                message = message[lang] || message.en || message.ar || '';
            }
            
            return {
                ...obj,
                title: title || (lang === 'ar' ? 'تنبيه' : 'Notification'),
                message: message,
                body: message, // Alias for Flutter app compatibility
                id: obj._id,   // Alias for Flutter app compatibility
                read: obj.isRead // Alias for Flutter app compatibility
            };
        });
        
        res.json(formattedNotifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
router.get('/notifications/unread-count', protect, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ user: req.user._id, isRead: false });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Mark all notifications as read
// @route   POST /api/notifications/mark-read
// @access  Private
router.post('/notifications/mark-read', protect, async (req, res) => {
    try {
        await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Manually trigger doctor reminder processing (Admin)
// @route   POST /api/notifications/trigger-reminders
// @access  Private (Super Admin)
router.post('/notifications/trigger-reminders', protect, authorize('super admin'), async (req, res) => {
    try {
        const ReminderScheduler = require('../services/reminderScheduler');
        const results = await ReminderScheduler.triggerNow();
        res.status(200).json({
            success: true,
            message: 'Reminder processing triggered',
            results: results
        });
    } catch (error) {
        console.error("Trigger Reminders Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Broadcast notification to all users
// @route   POST /api/notifications/broadcast
// @access  Private (Admin/Manager/Staff)
router.post('/notifications/broadcast', protect, authorize('super admin', 'hospital manager', 'hospital staff'), async (req, res) => {
    try {
        const { message, title, type = 'system' } = req.body;
        const { createNotification } = require('../utils/notificationHelper');

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        let userQuery = { isActive: true, isDisabled: false };

        // If not super admin, restrict to users in the manager's/staff's assigned hospitals
        if (req.user.role !== 'super admin') {
            const hospitalIds = req.user.hospitals;
            if (hospitalIds && hospitalIds.length > 0) {
                userQuery.hospitals = { $in: hospitalIds };
                userQuery.role = 'patient'; // Managers/Staff usually broadcast to patients
            } else {
                return res.status(403).json({ error: 'You are not assigned to any hospital' });
            }
        }

        // Fetch IDs of matching users
        const users = await User.find(userQuery, '_id');

        // Create notifications using helper for each user
        // Note: insertMany is faster but createNotification handles external push/email/sms
        for (const user of users) {
            await createNotification(user._id, type, message, { title });
        }

        res.status(200).json({
            success: true,
            message: `Notification sent to ${users.length} users.`
        });
    } catch (error) {
        console.error("Broadcast Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Send targeted notification to specific users
// @route   POST /api/notifications/targeted
// @access  Private (Admin/Manager/Staff)
router.post('/notifications/targeted', protect, authorize('super admin', 'hospital manager', 'hospital staff'), async (req, res) => {
    try {
        const { userIds, message, title, type = 'system' } = req.body;
        const { createNotification } = require('../utils/notificationHelper');
        
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'User IDs are required' });
        }
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Create notifications using helper for each user
        for (const id of userIds) {
            await createNotification(id, type, message, { title });
        }

        res.status(200).json({
            success: true,
            message: `Notification sent to ${userIds.length} users.`
        });
    } catch (error) {
        console.error("Targeted Notification Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Register FCM token for push notifications
// @route   POST /api/notifications/register-token
// @access  Private
router.post('/notifications/register-token', protect, async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'FCM token is required' });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.fcmToken = token;
        user.fcmTokenUpdatedAt = new Date();
        await user.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'FCM token registered successfully'
        });
    } catch (error) {
        console.error("FCM Token Registration Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get notification preferences
// @route   GET /api/notifications/preferences
// @access  Private
router.get('/notifications/preferences', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('notificationPreferences fcmToken');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({
            success: true,
            preferences: user.notificationPreferences || {
                push: true,
                email: true,
                sms: false,
                appointment: true,
                reminder: true,
                wallet: true,
                system: true
            },
            hasFcmToken: !!user.fcmToken
        });
    } catch (error) {
        console.error("Get Preferences Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Update notification preferences
// @route   PUT /api/notifications/preferences
// @access  Private
router.put('/notifications/preferences', protect, async (req, res) => {
    try {
        const { preferences } = req.body;
        if (!preferences) {
            return res.status(400).json({ error: 'Preferences are required' });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update preferences
        user.notificationPreferences = {
            ...user.notificationPreferences,
            ...preferences
        };
        await user.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'Notification preferences updated successfully',
            preferences: user.notificationPreferences
        });
    } catch (error) {
        console.error("Update Preferences Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// --- EMERGENCY CONTACTS ---

// @desc    Get all emergency contacts for a user
// @route   GET /api/emergency-contacts
// @access  Private
router.get('/emergency-contacts', protect, async (req, res) => {
    try {
        const contacts = await EmergencyContact.find({ user: req.user._id });
        res.json(contacts);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Create an emergency contact
// @route   POST /api/emergency-contacts
// @access  Private
router.post('/emergency-contacts', protect, async (req, res) => {
    try {
        const { name, relation, phone } = req.body;
        const contact = await EmergencyContact.create({ user: req.user._id, name, relation, phone });
        res.status(201).json(contact);
    } catch (error) {
        res.status(400).json({ error: 'Please provide all required fields' });
    }
});

// @desc    Update an emergency contact
// @route   PUT /api/emergency-contacts/:id
// @access  Private
router.put('/emergency-contacts/:id', protect, async (req, res) => {
    try {
        const contact = await EmergencyContact.findOne({ _id: req.params.id, user: req.user._id });
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        const updatedContact = await EmergencyContact.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedContact);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Delete an emergency contact
// @route   DELETE /api/emergency-contacts/:id
// @access  Private
router.delete('/emergency-contacts/:id', protect, async (req, res) => {
    try {
        const contact = await EmergencyContact.findOne({ _id: req.params.id, user: req.user._id });
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        await contact.deleteOne();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});


module.exports = router;
