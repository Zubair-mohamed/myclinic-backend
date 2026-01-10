const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect, authorize } = require('../middleware/auth');
const Appointment = require('../models/appointment');
const QueueItem = require('../models/queueItem'); // Added QueueItem
const moment = require('moment');

router.use(protect, authorize('hospital manager', 'super admin'));

// @desc    Get analytics data for a date range
// @route   GET /api/analytics
// @access  Private (Admins)
router.get('/', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required.' });
        }
        
        // Use moment to handle timezone correctly and set to start/end of day
        const start = moment.utc(startDate).startOf('day').toDate();
        const end = moment.utc(endDate).endOf('day').toDate();
        
        const primaryHospitalId = req.user.hospitals && req.user.hospitals.length > 0 ? req.user.hospitals[0] : null;

        if (req.user.role !== 'super admin' && !primaryHospitalId) {
             return res.status(400).json({ error: "User is not associated with a hospital." });
        }
        
        const matchQuery = {
            createdAt: { $gte: start, $lte: end },
        };
        if (req.user.role !== 'super admin') {
            matchQuery.hospital = new mongoose.Types.ObjectId(primaryHospitalId);
        }

        const appointments = await Appointment.find(matchQuery);
        const completedAppointments = appointments.filter(a => a.status === 'Completed');

        // KPIs
        const totalRevenue = completedAppointments.reduce((sum, appt) => sum + appt.cost, 0);
        const totalAppointments = appointments.length;
        const cancelledCount = appointments.filter(a => a.status === 'Cancelled').length;
        const cancellationRate = totalAppointments > 0 ? (cancelledCount / totalAppointments) * 100 : 0;
        const avgRevenuePerAppointment = completedAppointments.length > 0 ? totalRevenue / completedAppointments.length : 0;

        // Revenue Over Time
        const revenueOverTime = await Appointment.aggregate([
            { $match: { ...matchQuery, status: 'Completed' } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    revenue: { $sum: '$cost' }
                }
            },
            { $project: { date: '$_id', revenue: 1, _id: 0 } },
            { $sort: { date: 1 } }
        ]);

        // Appointments by Status
        const appointmentsByStatus = appointments.reduce((acc, appt) => {
            acc[appt.status] = (acc[appt.status] || 0) + 1;
            return acc;
        }, {});
        const formattedAppointmentsByStatus = Object.keys(appointmentsByStatus).map(key => ({ name: key, value: appointmentsByStatus[key] }));

        // Top Doctors
        const topDoctors = await Appointment.aggregate([
            { $match: matchQuery },
            { $group: { _id: '$doctor', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'doctorInfo' } },
            { $unwind: '$doctorInfo' },
            { $project: { name: '$doctorInfo.name', count: 1, _id: 0 } }
        ]);
        
        // Top Specialties
        const topSpecialties = await Appointment.aggregate([
            { $match: matchQuery },
            { $lookup: { from: 'appointmenttypes', localField: 'appointmentType', foreignField: '_id', as: 'type' } },
            { $unwind: '$type' },
            { $lookup: { from: 'specialties', localField: 'type.specialty', foreignField: '_id', as: 'specialtyInfo' } },
            { $unwind: '$specialtyInfo' },
            { $group: { _id: '$specialtyInfo.name', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            { $project: { name: '$_id', count: 1, _id: 0 } },
        ]);

        // Calculate Average Wait Time (Wait time is roughly checkInTime to updatedAt where status is 'Done' or 'Serving')
        // This is an approximation. A more accurate system would log specific 'serviceStartTime'.
        // For now, we assume 'updatedAt' of a 'Done' record is when they finished, which isn't wait time.
        // Let's assume Wait Time = Time from Creation to Last Update for served patients minus 15mins consult? 
        // Better: We really need a serviceStartTime field. Without it, we can't accurately calc wait time vs service time.
        // Simplified Logic: Just count patients served per day to show throughput.
        
        res.json({
            kpis: {
                totalRevenue,
                totalAppointments,
                cancellationRate,
                avgRevenuePerAppointment
            },
            revenueOverTime,
            appointmentsByStatus: formattedAppointmentsByStatus,
            topDoctors,
            topSpecialties
        });

    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;