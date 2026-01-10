

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect, authorize } = require('../middleware/auth');
const Appointment = require('../models/appointment');
const QueueItem = require('../models/queueItem');
const User = require('../models/user');
const Hospital = require('../models/hospital');
const Specialty = require('../models/specialty');
const AppointmentType = require('../models/appointmentType');
const Notification = require('../models/notification');
const geminiService = require('../services/geminiService');
const walletService = require('../services/walletService');
const Wallet = require('../models/wallet');
const moment = require('moment');
const { createNotification } = require('../utils/notificationHelper');
const ExternalNotificationService = require('../services/externalNotificationService');


// All routes are protected
router.use(protect);


// @desc    Get appointments for user/doctor/admin
// @route   GET /api/appointments
// @access  Private
router.get('/', async (req, res) => {
    try {
        const { role, _id, hospitals } = req.user;
        let query = {};
        
        if (role === 'patient') {
            query = { user: _id };
        } else if (role === 'doctor') {
            query = { doctor: _id };
        } else if (role === 'super admin') {
            query = {}; // Super admin sees all appointments from all hospitals
        } else { // For hospital staff and managers
            const primaryHospitalId = hospitals && hospitals.length > 0 ? hospitals[0] : null;
            if (primaryHospitalId) {
                query = { hospital: primaryHospitalId };
            } else {
                // If staff/manager has no hospital assigned, return empty array
                return res.json([]);
            }
        }
        
        const appointments = await Appointment.find(query)
            .populate('user', 'name email phone')
            .populate('doctor', 'name email')
            .populate('hospital', 'name')
            .populate({
                path: 'appointmentType',
                populate: { path: 'specialty', select: 'name' }
            })
            .populate('reports')
            .sort({ date: -1, time: -1 });
        
        res.json(appointments);
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Find replacement doctors for a cancelled appointment
// @route   GET /api/appointments/:id/find-replacements
// @access  Private
router.get('/:id/find-replacements', async (req, res) => {
    try {
        const appt = await Appointment.findById(req.params.id)
            .populate('doctor', 'name specialties hospitals')
            .populate('hospital', 'name')
            .populate({
                path: 'appointmentType',
                populate: { path: 'specialty', select: 'name' }
            });

        if (!appt) return res.status(404).json({ error: 'Appointment not found' });
        
        const originalDoctorId = appt.doctor._id;
        const hospitalId = appt.hospital._id;
        const specialtyId = appt.appointmentType.specialty._id;
        const date = appt.date;

        // Search for other doctors in same hospital and specialty
        const doctors = await User.find({
            role: 'doctor',
            _id: { $ne: originalDoctorId },
            hospitals: hospitalId,
            specialties: specialtyId,
            isActive: true,
            isDisabled: false
        }).select('name avatar availability unavailabilityEpisodes specialties hospitals')
        .populate('specialties', 'name')
        .populate('hospitals', 'name');

        const suggestions = [];

        for (const dr of doctors) {
            const dayOfWeek = moment(date, 'YYYY-MM-DD').locale('en').format('dddd');
            const dayAvail = (dr.availability || []).find(d => {
                const availHospId = d.hospital ? (d.hospital._id ? d.hospital._id.toString() : d.hospital.toString()) : null;
                // If the availability entry doesn't have a hospital ID, and doctor has only one hospital, assume it's this hospital
                const isCorrectHospital = availHospId === hospitalId.toString() || 
                                         (!availHospId && dr.hospitals && dr.hospitals.length === 1 && dr.hospitals[0].toString() === hospitalId.toString());
                
                return d.dayOfWeek === dayOfWeek && d.isAvailable && isCorrectHospital;
            });

            if (!dayAvail) continue;

            const isUnavailable = (dr.unavailabilityEpisodes || []).some(ep => {
                const start = new Date(ep.startDate);
                const end = new Date(ep.endDate);
                const dDate = new Date(date);
                return dDate >= start && dDate <= end;
            });

            if (isUnavailable) continue;

            suggestions.push({
                doctor: dr,
                startTime: dayAvail.startTime,
                endTime: dayAvail.endTime
            });
        }

        res.json(suggestions);
    } catch (error) {
        console.error('Find replacements error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @desc    Get today's appointments for a doctor
// @route   GET /api/appointments/today
// @access  Private (Doctor)
router.get('/today', async (req, res) => {
    try {
        const doctorId = req.query.doctorId || req.user._id;
        const today = moment().format('YYYY-MM-DD');
        
        const appointments = await Appointment.find({
            doctor: doctorId,
            date: today,
            status: { $ne: 'Cancelled' }
        })
        .populate('user', 'name email phone')
        .populate('hospital', 'name')
        .populate('appointmentType', 'name duration')
        .sort({ time: 1 });
        
        res.json(appointments);
    } catch (error) {
        console.error('Error fetching today\'s appointments:', error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get upcoming appointments for a user
// @route   GET /api/appointments/upcoming
// @access  Private
router.get('/upcoming', async (req, res) => {
    try {
        const userId = req.query.userId || req.user._id;
        const today = moment().format('YYYY-MM-DD');
        
        const appointments = await Appointment.find({
            user: userId,
            date: { $gte: today },
            status: 'Upcoming'
        })
        .populate('doctor', 'name')
        .populate('hospital', 'name')
        .populate('appointmentType', 'name')
        .sort({ date: 1, time: 1 });
        
        res.json(appointments);
    } catch (error) {
        console.error('Error fetching upcoming appointments:', error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get appointment history for a user
// @route   GET /api/appointments/history
// @access  Private
router.get('/history', async (req, res) => {
    try {
        const userId = req.query.userId || req.user._id;
        
        const appointments = await Appointment.find({
            user: userId,
            status: { $in: ['Completed', 'Cancelled', 'NoShow'] }
        })
        .populate('doctor', 'name')
        .populate('hospital', 'name')
        .populate('appointmentType', 'name')
        .sort({ date: -1, time: -1 });
        
        res.json(appointments);
    } catch (error) {
        console.error('Error fetching appointment history:', error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Update appointment status
// @route   PUT /api/appointments/:id/status
// @access  Private
router.put('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const appointment = await Appointment.findById(req.params.id);
        
        if (!appointment) {
            return res.status(404).json({ error: 'Appointment not found' });
        }
        
        appointment.status = status;
        await appointment.save();
        
        res.json(appointment);
    } catch (error) {
        console.error('Error updating appointment status:', error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Reschedule an appointment
// @route   PUT /api/appointments/:id/reschedule
// @access  Private
router.put('/:id/reschedule', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const { date, time } = req.body;
            const appointment = await Appointment.findById(req.params.id).populate('doctor').session(session);
            
            if (!appointment) {
                throw new Error('Appointment not found');
            }
            
            const oldDate = appointment.date;
            const today = moment().format('YYYY-MM-DD');

            // If date changed, we must update the queue number to be valid for the new date
            if (date !== oldDate) {
                const count = await Appointment.countDocuments({ doctor: appointment.doctor._id, date: date }).session(session);
                const queueNumber = `${appointment.doctor.name.en.charAt(0).toUpperCase()}${(count + 1).toString().padStart(3, '0')}`;
                appointment.queueNumber = queueNumber;

                // Handle QueueItem transitions
                if (oldDate === today) {
                    // Leaving today's queue
                    await QueueItem.findOneAndDelete({ 
                        user: appointment.user, 
                        doctor: appointment.doctor._id,
                        status: { $in: ['Waiting', 'Held'] }
                    }).session(session);
                }

                if (date === today) {
                    // Entering today's queue
                    await QueueItem.create([{
                        user: appointment.user,
                        doctor: appointment.doctor._id,
                        hospital: appointment.hospital,
                        queueNumber: appointment.queueNumber,
                        status: 'Waiting'
                    }], { session });
                }
            }

            appointment.date = date;
            appointment.time = time;
            appointment.status = 'Upcoming'; // Reset status if it was something else
            await appointment.save({ session });
        });
        
        const updatedAppointment = await Appointment.findById(req.params.id);
        res.json(updatedAppointment);
    } catch (error) {
        console.error('Error rescheduling appointment:', error);
        res.status(500).json({ error: error.message || 'Server Error' });
    } finally {
        await session.endSession();
    }
});

// @desc    Get AI-powered Symptom Analysis (Diagnosis Helper)
// @route   POST /api/appointments/analyze
// @access  Private (patient only)
router.post('/analyze', authorize('patient'), async (req, res) => {
    const { symptoms, language } = req.body;
    
    // Validating input logic
    if (!symptoms) {
         return res.status(400).json({ error: 'Symptoms are required for analysis.' });
    }

    try {
        // 1. Get available specialties to help AI recommend the right one that exists in our DB
        // Fetches both EN and AR names for context
        const specialties = await Specialty.find({}).select('name');
        
        // 2. Construct basic patient profile from User model
        const patientProfile = {
            age: 30, // Default if not in DB, ideally fetch from User.dob
            gender: 'Unknown',
            chronicConditions: req.user.medicalProfile?.chronicConditions || []
        };

        // 3. Call AI Service with Language
        const analysisResult = await geminiService.analyzeSymptoms(
            symptoms, 
            patientProfile,
            specialties,
            language || 'en' // Default to English if not provided
        );
        
        res.json(analysisResult);
    } catch (error) {
        console.error("Analysis error:", error);
        res.status(500).json({ error: 'Failed to analyze symptoms.' });
    }
});


// @desc    Create an appointment
// @route   POST /api/appointments
// @access  Private (patient, staff, manager, admin)
router.post('/', async (req, res) => {
    const { date, time, doctorId, hospitalId, appointmentTypeId, force, patientId, cashPayment } = req.body;

    // Determine the target patient ID
    let targetUserId = req.user._id; // Default to current user (patient)

    // Allow staff/admins to book for others
    if (['hospital staff', 'hospital manager', 'super admin'].includes(req.user.role)) {
        if (!patientId) {
            return res.status(400).json({ error: 'Patient ID is required for staff booking.' });
        }
        targetUserId = patientId;
    } else if (req.user.role !== 'patient') {
        return res.status(403).json({ error: 'Not authorized to book appointments.' });
    }

    // --- CONFLICT DETECTION LOGIC ---
    // Hard stop: prevent exact duplicate booking (same doctor + same date + same time).
    // This should be blocked even if the request uses force=true.
    try {
        const existingExact = await Appointment.findOne({
            user: targetUserId,
            status: 'Upcoming',
            date: date,
            time: time,
            doctor: doctorId
        })
        .populate('doctor', 'name')
        .populate('appointmentType', 'name');

        if (existingExact) {
            return res.status(409).json({
                error: 'Duplicate Appointment',
                conflictDetails: {
                    isDuplicate: true,
                    doctorId: existingExact.doctor?._id?.toString(),
                    appointmentTypeId: existingExact.appointmentType?._id?.toString(),
                    doctorName: existingExact.doctor ? existingExact.doctor.name : { en: 'Doctor', ar: 'طبيب' },
                    appointmentType: existingExact.appointmentType ? existingExact.appointmentType.name : { en: 'Service', ar: 'خدمة' },
                    time: existingExact.time,
                    date: existingExact.date,
                    diffMinutes: 0
                }
            });
        }
    } catch (err) {
        console.error("Error checking for exact duplicates:", err);
        // Continue; don't fail booking if this check errors.
    }

    if (!force) {
        try {
            // Find existing appointments for this user on the same day
            const existingAppointments = await Appointment.find({
                user: targetUserId,
                status: 'Upcoming',
                date: date // Exact string match YYYY-MM-DD
            })
            .populate('doctor', 'name')
            .populate('appointmentType', 'name'); // Populate to get the service name

            if (existingAppointments.length > 0) {
                console.log(`[CONFLICT CHECK] Found ${existingAppointments.length} upcoming appointments for user ${targetUserId} on ${date}`);
                const requestedMoment = moment(`${date} ${time}`, 'YYYY-MM-DD h:mm A');
                
                for (const appt of existingAppointments) {
                    // Skip if it's the exact same appointment (though unlikely in POST)
                    if (appt._id.toString() === (req.body.appointmentId || '')) continue;

                    const existingMoment = moment(`${appt.date} ${appt.time}`, 'YYYY-MM-DD h:mm A');
                    
                    // If moments are invalid, skip this check
                    if (!requestedMoment.isValid() || !existingMoment.isValid()) {
                        continue;
                    }

                    // Calculate difference in minutes
                    const diffMinutes = Math.abs(requestedMoment.diff(existingMoment, 'minutes'));
                    console.log(`[CONFLICT CHECK] Comparing requested ${time} with existing ${appt.time}. Diff: ${diffMinutes} mins`);
                    
                    // Check if the difference is within the buffer (e.g., 60 minutes)
                    if (diffMinutes < 60) {
                        console.log(`[CONFLICT CHECK] CONFLICT DETECTED!`);
                        return res.status(409).json({ 
                            error: 'Schedule Conflict',
                            conflictDetails: {
                                isDuplicate: false,
                                doctorId: appt.doctor?._id?.toString(),
                                appointmentTypeId: appt.appointmentType?._id?.toString(),
                                doctorName: appt.doctor ? appt.doctor.name : { en: 'Doctor', ar: 'طبيب' },
                                appointmentType: appt.appointmentType ? appt.appointmentType.name : { en: 'Service', ar: 'خدمة' },
                                time: appt.time,
                                date: appt.date,
                                diffMinutes: diffMinutes
                            }
                        });
                    }
                }
            }
        } catch (err) {
            console.error("Error checking for conflicts:", err);
            // Continue without failing; conflict check is a "soft" guard.
        }
    }
    // --------------------------------

    const session = await mongoose.startSession();
    let appointment;

    try {
        await session.withTransaction(async () => {
            if (!doctorId || !hospitalId || !appointmentTypeId) {
                throw new Error('Doctor, hospital, and appointment type must be specified.');
            }

            const [appointmentType, doctor, hospital, patient] = await Promise.all([
                AppointmentType.findById(appointmentTypeId).session(session),
                User.findById(doctorId).session(session),
                Hospital.findById(hospitalId).session(session),
                User.findById(targetUserId).session(session)
            ]);

            if (!appointmentType) throw new Error('Invalid appointment type specified.');
            if (!doctor) throw new Error('Specified doctor not found.');
            if (!hospital) throw new Error('Specified hospital not found.');
            if (!patient) throw new Error('Specified patient not found.');
            
            // Check if doctor or patient account is disabled
            if (doctor.isDisabled) {
                throw new Error('The selected doctor\'s account has been disabled.');
            }
            if (patient.isDisabled) {
                throw new Error('The patient\'s account has been disabled.');
            }

            // --- CHECK UNAVAILABILITY EPISODES ---
            const bookingDate = new Date(date);
            const isUnavailable = (doctor.unavailabilityEpisodes || []).some(ep => {
                const start = new Date(ep.startDate);
                const end = new Date(ep.endDate);
                return bookingDate >= start && bookingDate <= end;
            });

            if (isUnavailable) {
                throw new Error('The selected doctor is currently unavailable during this period.');
            }
            // ------------------------------------

            const cost = appointmentType.cost;

            const doctorHospitalIds = doctor.hospitals.map(h => h.toString());
            if (!doctorHospitalIds.includes(hospitalId)) {
                throw new Error('Selected doctor does not work at this hospital.');
            }

            // --- CASH PAYMENT HANDLING ---
            if (cashPayment && ['hospital staff', 'hospital manager', 'super admin'].includes(req.user.role)) {
                // If cash payment is confirmed by staff, auto-deposit the funds first
                const depositData = {
                    userId: targetUserId,
                    amount: cost,
                    type: 'credit',
                    transactionType: 'Deposit',
                    description: `Cash payment collected at hospital counter for appointment.`,
                    referenceId: `CASH_${Date.now()}`,
                    hospitalId: hospitalId
                };
                await walletService.createTransactionAndUpdateWallet(depositData, { session });
            }
            // -----------------------------

            const currentWalletState = await Wallet.findOne({ user: targetUserId }).session(session);
            // Check balance 
            if (!currentWalletState || currentWalletState.balance < cost) {
                throw new Error(`Insufficient wallet balance for patient ${patient.name.en}.`);
            }
            
            // Generate Queue Number
            const count = await Appointment.countDocuments({ doctor: doctorId, date: date }).session(session);
            const queueNumber = `${doctor.name.en.charAt(0).toUpperCase()}${(count + 1).toString().padStart(3, '0')}`;

            const createdAppointments = await Appointment.create([{
                user: targetUserId,
                doctor: doctorId,
                hospital: hospitalId,
                appointmentType: appointmentTypeId, 
                date, 
                time, 
                cost, 
                status: 'Upcoming',
                queueNumber: queueNumber
            }], { session });
            appointment = createdAppointments[0];

            // If appointment is for today, add to active queue directly
            const today = moment().format('YYYY-MM-DD');
            if (date === today) {
                // Check if already in queue to avoid duplicates
                const alreadyInQueue = await QueueItem.findOne({ 
                    user: targetUserId, 
                    status: { $in: ['Waiting', 'Serving', 'Held'] } 
                }).session(session);

                if (!alreadyInQueue) {
                    await QueueItem.create([{
                        user: targetUserId,
                        doctor: doctorId,
                        hospital: hospitalId,
                        queueNumber: queueNumber,
                        status: 'Waiting'
                    }], { session });
                }
            }

            const transactionData = {
                userId: targetUserId,
                amount: cost,
                type: 'debit',
                transactionType: 'Appointment Fee',
                description: `Fee for ${appointmentType.name.en} with Dr. ${doctor.name.en} at ${hospital.name.en}`,
                referenceId: appointment._id.toString(),
                hospitalId: hospitalId
            };
            await walletService.createTransactionAndUpdateWallet(transactionData, { session });

            // Create notification (in-app + external)
            await createNotification(
                targetUserId,
                'appointment',
                {
                    en: `Your appointment for a ${appointmentType.name.en} with ${doctor.name.en} on ${new Date(date).toLocaleDateString()} is confirmed.`,
                    ar: `تم تأكيد موعدك لـ ${appointmentType.name.ar} مع ${doctor.name.ar} في ${new Date(date).toLocaleDateString()}.`
                },
                {
                    title: {
                        en: 'Appointment Confirmed',
                        ar: 'تم تأكيد الموعد'
                    },
                    language: 'ar', // Default to Arabic for external if we don't know
                    data: {
                        doctorName: doctor.name.en,
                        date: new Date(date).toLocaleDateString(),
                        time: time,
                        appointmentType: appointmentType.name.en,
                        link: `#/appointments`
                    },
                    session: session
                }
            );
        });

        res.status(201).json(appointment);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: 'This time slot was just booked by someone else. Please select another time.' });
        }
        
        let statusCode = 500;
        if (error.message.includes('Insufficient') || error.message.includes('not found') || error.message.includes('must be specified')) {
            statusCode = 400;
        }
        
        res.status(statusCode).json({ error: error.message || 'Server Error' });
    } finally {
        await session.endSession();
    }
});

// @desc    Doctor cancels an appointment due to emergency/excuse
// @route   PUT /api/appointments/doctor-cancel/:id
// @access  Private
router.put('/doctor-cancel/:id', protect, authorize('doctor', 'hospital staff', 'hospital manager', 'super admin'), async (req, res) => {
    try {
        const appt = await Appointment.findById(req.params.id)
            .populate('user')
            .populate('doctor', 'name')
            .populate('hospital', 'name');

        if (!appt) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        // Verify doctor owns the appointment or user is admin
        const isDoctorOwner = req.user.role === 'doctor' && appt.doctor._id.toString() === req.user._id.toString();
        const userHospitalIds = (req.user.hospitals || []).map(h => h.toString());
        const isAdminOfHospital = ['hospital staff', 'hospital manager', 'super admin'].includes(req.user.role) && userHospitalIds.includes(appt.hospital._id.toString());

        if (!isDoctorOwner && !isAdminOfHospital) {
            return res.status(403).json({ error: 'Not authorized to cancel this appointment' });
        }

        appt.status = 'DoctorCancelled';
        appt.cancellationResolution = 'Pending';
        await appt.save();

        // 1. Create In-App Notification
        await createNotification(
            appt.user._id,
            'Appointment Cancelled by Doctor',
            `Dr. ${appt.doctor.name.ar || appt.doctor.name.en} has apologized for the appointment on ${appt.date} at ${appt.time}. Please open the app to choose a resolution.`,
            'appointment_cancelled',
            appt._id
        );

        // 2. Send External Notification (FCM/Email)
        try {
            await ExternalNotificationService.sendToUser(appt.user._id, {
                title: 'تنبيه: اعتذار طبيب',
                body: `نعتذر منك، لقد تعذر حضور الدكتور ${appt.doctor.name.ar || appt.doctor.name.en} لموعدكم. يرجى الدخول للتطبيق لاختيار بديل.`,
                data: {
                    type: 'doctor_apology',
                    appointmentId: appt._id.toString()
                }
            });
        } catch (error) {
            console.error('Error sending external notification:', error);
        }

        res.json({ message: 'Appointment marked as DoctorCancelled and patient notified.', appt });
    } catch (error) {
        console.error('Doctor cancellation error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @desc    Patient resolves a doctor-cancelled appointment
// @route   PUT /api/appointments/:id/resolve-cancellation
// @access  Private
router.put('/:id/resolve-cancellation', protect, async (req, res) => {
    const { action, newDoctorId, newSlot } = req.body; // action: 'Redirect', 'Reschedule', 'Refund'
    const session = await mongoose.startSession();

    try {
        let result;
        await session.withTransaction(async () => {
            const appt = await Appointment.findById(req.params.id)
                .populate('doctor hospital user')
                .populate('appointmentType')
                .session(session);

            if (!appt) throw new Error('Appointment not found');
            if (appt.user._id.toString() !== req.user._id.toString()) throw new Error('Not authorized');
            if (appt.status !== 'DoctorCancelled') throw new Error('This appointment is not cancelled by doctor');
            if (appt.cancellationResolution !== 'Pending') throw new Error('Resolution already processed');

            if (action === 'Refund') {
                // 100% Refund only in this case
                const refundAmount = appt.cost;
                if (refundAmount > 0) {
                    await walletService.createTransactionAndUpdateWallet({
                        userId: appt.user._id,
                        amount: refundAmount,
                        type: 'credit',
                        transactionType: 'Refund',
                        description: `Full refund for doctor apology: ${appt.doctor.name.en}`,
                        referenceId: appt._id.toString(),
                        hospitalId: appt.hospital._id
                    }, { session });
                }
                appt.status = 'Cancelled';
                appt.isRefunded = true;
                appt.cancellationResolution = 'Refunded';
                await appt.save({ session });

                await createNotification(
                    appt.user._id,
                    'appointment',
                    {
                        en: `Your appointment has been cancelled and a full refund has been processed.`,
                        ar: `تم إلغاء موعدك وتمت معالجة الاسترجاع بالكامل.`
                    },
                    {
                        title: {
                            en: 'Appointment Cancelled',
                            ar: 'تم إلغاء الموعد'
                        },
                        language: 'ar',
                        data: {
                            appointmentId: appt._id.toString(),
                            status: 'Cancelled',
                            link: `#/appointments`
                        },
                        session: session
                    }
                );

                result = { message: 'Full refund processed successfully' };

            } else if (action === 'Redirect') {
                // Change doctor to another one in same specialty
                if (!newDoctorId) throw new Error('New doctor ID is required for redirection');
                
                appt.doctor = newDoctorId;
                appt.status = 'Upcoming';
                appt.cancellationResolution = 'Redirected';
                if (newSlot) {
                    appt.date = newSlot.date || appt.date;
                    appt.time = newSlot.time || appt.time;
                }
                await appt.save({ session });
                result = { message: 'Appointment redirected successfully', appointment: appt };

            } else if (action === 'Reschedule') {
                // Keep same doctor, change time
                if (!newSlot || !newSlot.date || !newSlot.time) throw new Error('New slot (date and time) is required');
                
                appt.date = newSlot.date;
                appt.time = newSlot.time;
                appt.status = 'Upcoming';
                appt.cancellationResolution = 'Rescheduled';
                await appt.save({ session });
                result = { message: 'Appointment rescheduled successfully', appointment: appt };
            } else {
                throw new Error('Invalid action');
            }
        });

        res.json(result);
    } catch (error) {
        console.error('Resolution error:', error);
        res.status(400).json({ error: error.message });
    } finally {
        session.endSession();
    }
});

// @desc    Update an appointment status
// @route   PUT /api/appointments/:id
// @access  Private
router.put('/:id', async (req, res) => {
    const session = await mongoose.startSession();
    let populatedAppt;

    try {
        await session.withTransaction(async () => {
            const { status } = req.body;
            const appt = await Appointment.findById(req.params.id).populate('hospital').populate('doctor', 'name').populate('appointmentType', 'name').session(session);

            if (!appt) throw new Error('Appointment not found.');

            const isPatientOwner = req.user.role === 'patient' && appt.user.toString() === req.user._id.toString();
            const userHospitalIds = req.user.hospitals.map(h => h.toString());
            const isAdminOfHospital = ['hospital staff', 'hospital manager', 'super admin'].includes(req.user.role) && userHospitalIds.includes(appt.hospital._id.toString());

            if (!isPatientOwner && !isAdminOfHospital) {
                throw new Error('Not authorized to update this appointment.');
            }

            // Patients can cancel. Admins can mark as Completed or NoShow.
            if (isPatientOwner && status !== 'Cancelled') {
                throw new Error('Patients can only cancel appointments.');
            }

            appt.status = status;
            
            // Refund logic remains for Cancellations
            if (status === 'Cancelled' && !appt.isRefunded) {
                const refundAmount = appt.cost * (appt.hospital.refundPolicyPercentage / 100);
                if(refundAmount > 0) {
                    const transactionData = {
                        userId: appt.user,
                        amount: refundAmount,
                        type: 'credit',
                        transactionType: 'Refund',
                        description: `Refund for cancelled ${appt.appointmentType.name.en} with Dr. ${appt.doctor.name.en} at ${appt.hospital.name.en}`,
                        referenceId: appt._id.toString(),
                        hospitalId: appt.hospital._id
                    };
                    await walletService.createTransactionAndUpdateWallet(transactionData, { session });
                }
                appt.isRefunded = true;
            }

            await appt.save({ session });

            if (status === 'Cancelled') {
                const doctorNameEn = appt.doctor?.name?.en || appt.doctor?.name?.ar || '';
                const doctorNameAr = appt.doctor?.name?.ar || appt.doctor?.name?.en || '';
                const apptTypeEn = appt.appointmentType?.name?.en || appt.appointmentType?.name?.ar || '';
                const apptTypeAr = appt.appointmentType?.name?.ar || appt.appointmentType?.name?.en || '';
                const hospitalEn = appt.hospital?.name?.en || appt.hospital?.name?.ar || '';
                const hospitalAr = appt.hospital?.name?.ar || appt.hospital?.name?.en || '';
                const dateText = new Date(appt.date).toLocaleDateString();
                const timeText = appt.time || '';

                await createNotification(
                    appt.user,
                    'appointment',
                    {
                        en: `Your appointment${apptTypeEn ? ` for ${apptTypeEn}` : ''}${doctorNameEn ? ` with Dr. ${doctorNameEn}` : ''}${hospitalEn ? ` at ${hospitalEn}` : ''} on ${dateText}${timeText ? ` at ${timeText}` : ''} has been cancelled.`,
                        ar: `تم إلغاء موعدك${apptTypeAr ? ` لـ ${apptTypeAr}` : ''}${doctorNameAr ? ` مع د. ${doctorNameAr}` : ''}${hospitalAr ? ` في ${hospitalAr}` : ''} بتاريخ ${dateText}${timeText ? ` في ${timeText}` : ''}.`
                    },
                    {
                        title: {
                            en: 'Appointment Cancelled',
                            ar: 'تم إلغاء الموعد'
                        },
                        language: 'ar',
                        data: {
                            appointmentId: appt._id.toString(),
                            doctorName: doctorNameEn,
                            date: dateText,
                            time: timeText,
                            appointmentType: apptTypeEn,
                            status: 'Cancelled',
                            link: `#/appointments`
                        },
                        session: session
                    }
                );
            }
            
            populatedAppt = await Appointment.findById(appt._id)
                .populate('user', 'name')
                .populate('doctor', 'name')
                .populate('hospital', 'name')
                .populate({
                    path: 'appointmentType',
                    populate: { path: 'specialty', select: 'name' }
                })
                .session(session);
        });

        res.json(populatedAppt);
    } catch (error) {
        let statusCode = 500;
        if (error.message.includes('Not authorized') || error.message.includes('can only cancel')) {
            statusCode = 403;
        } else if (error.message.includes('not found')) {
            statusCode = 404;
        }
        res.status(statusCode).json({ error: error.message || 'Server Error' });
    } finally {
        await session.endSession();
    }
});

// @desc    Set a reminder for an appointment
// @route   POST /api/appointments/:id/set-reminder
// @access  Private (Patient)
router.post('/:id/set-reminder', authorize('patient'), async (req, res) => {
    try {
        const { reminderOption } = req.body; // e.g., "1-hour-before"
        const appointment = await Appointment.findById(req.params.id).populate('doctor', 'name');

        if (!appointment) {
            return res.status(404).json({ error: 'Appointment not found.' });
        }

        if (appointment.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'You are not authorized for this appointment.' });
        }
        
        if (appointment.status !== 'Upcoming') {
            return res.status(400).json({ error: 'Can only set reminders for upcoming appointments.' });
        }
        
        if (appointment.reminderSet) {
             return res.status(400).json({ error: 'A reminder has already been set for this appointment.' });
        }

        const reminderTextMap = {
            '1-hour-before': { en: 'in 1 hour', ar: 'خلال ساعة' },
            '1-day-before': { en: 'in 1 day', ar: 'خلال يوم' },
            '2-days-before': { en: 'in 2 days', ar: 'خلال يومين' }
        };
        const reminderText = reminderTextMap[reminderOption] || { en: 'soon', ar: 'قريباً' };

        // In a real system, this would be scheduled. For now, create it instantly.
        await createNotification(
            req.user._id,
            'reminder',
            {
                en: `Reminder: Your appointment with Dr. ${appointment.doctor.name.en} is ${reminderText.en}. (${new Date(appointment.date).toLocaleDateString()} at ${appointment.time})`,
                ar: `تذكير: موعدك مع د. ${appointment.doctor.name.ar} هو ${reminderText.ar}. (${new Date(appointment.date).toLocaleDateString()} في ${appointment.time})`
            },
            {
                title: {
                    en: 'Appointment Reminder',
                    ar: 'تذكير بالموعد'
                },
                language: 'ar',
                data: {
                    doctorName: appointment.doctor.name.en,
                    date: new Date(appointment.date).toLocaleDateString(),
                    time: appointment.time,
                    link: `#/appointments`
                }
            }
        );
        
        appointment.reminderSet = true;
        await appointment.save();

        // Return the updated appointment so the frontend can update its state
        const populatedAppt = await Appointment.findById(appointment._id).populate('user', 'name').populate('doctor', 'name').populate('hospital', 'name').populate({
            path: 'appointmentType',
            populate: { path: 'specialty', select: 'name' }
        });
        res.status(200).json(populatedAppt);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Server Error' });
    }
});

// @desc    Get next available time slot for a doctor on a specific date (Auto-schedule)
// @route   GET /api/appointments/availability/doctor/:doctorId
// @access  Private (Patient, Staff)
router.get('/availability/doctor/:doctorId', async (req, res) => {
    try {
        const { date, appointmentTypeId, hospitalId } = req.query;
        const { doctorId } = req.params;

        if (!date || !appointmentTypeId || !hospitalId) {
            return res.status(400).json({ error: 'Date, appointment type, and hospital are required.' });
        }

        // FIX: Use moment to parse the YYYY-MM-DD string specifically to avoid timezone shifts.
        // Force locale to 'en' so 'dddd' returns English day names (Monday, Tuesday...) to match database values.
        const dayOfWeek = moment(date, 'YYYY-MM-DD').locale('en').format('dddd');

        const [doctor, appointmentType, existingAppointments] = await Promise.all([
            User.findById(doctorId),
            AppointmentType.findById(appointmentTypeId),
            Appointment.find({
                doctor: doctorId,
                hospital: hospitalId, // FIX: Filter by hospital to avoid cross-hospital queue interference
                date: date, // Exact string match for YYYY-MM-DD
                status: 'Upcoming'
            }).populate('appointmentType', 'duration').sort({ time: 1 }) // Sort by time ascending
        ]);
        
        if (!doctor || !appointmentType) {
            return res.status(404).json({ error: 'Doctor or appointment type not found.' });
        }

        // --- CHECK UNAVAILABILITY EPISODES ---
        const now = new Date();
        const bookingDate = new Date(date);
        // We check if the target date falls within any unavailability episode
        const isUnavailable = (doctor.unavailabilityEpisodes || []).some(ep => {
            const start = new Date(ep.startDate);
            const end = new Date(ep.endDate);
            // Set times to midnight for date-only comparison if needed, 
            // but usually episodes have specific times.
            // For now, simple check:
            return bookingDate >= start && bookingDate <= end;
        });

        if (isUnavailable) {
            return res.json({ 
                nextAvailableTime: null, 
                message: doctor.name.ar ? `الطبيب غير متاح في هذا التاريخ.` : `Doctor is not available on this date.` 
            });
        }
        // ------------------------------------
        
        // Find availability for the correct day AND the correct hospital
        // Robust check to handle populated vs ID vs string comparisons for hospital
        const dayAvailability = doctor.availability.find(d => {
            if (!d.hospital) return false;
            
            // Extract ID whether it's an object (populated) or a direct ID
            const availHospitalId = d.hospital._id ? d.hospital._id.toString() : d.hospital.toString();
            
            // Compare English day name AND hospital ID
            return d.dayOfWeek === dayOfWeek && availHospitalId === hospitalId;
        });

        if (!dayAvailability || !dayAvailability.isAvailable) {
            return res.json({ 
                nextAvailableTime: null, 
                message: `Doctor is not available on ${dayOfWeek} at this hospital.` 
            });
        }

        const { startTime, endTime } = dayAvailability;
        const requestedDuration = appointmentType.duration;
        
        const timeToMinutes = (timeStr) => {
            const is24Hour = !timeStr.includes("AM") && !timeStr.includes("PM");
            if (is24Hour) {
                const [hours, minutes] = timeStr.split(':').map(Number);
                return hours * 60 + minutes;
            }
            const [time, modifier] = timeStr.split(' ');
            let [hours, minutes] = time.split(':').map(Number);
            if (modifier.toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;
            return hours * 60 + minutes;
        };

        const minutesToTime = (minutes) => {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
            const formattedMinutes = mins.toString().padStart(2, '0');
            return `${formattedHours}:${formattedMinutes} ${ampm}`;
        };
        
        const doctorStartMinutes = timeToMinutes(startTime);
        let doctorEndMinutes = timeToMinutes(endTime);

        // Handle midnight wrap-around (e.g., 20:00 to 00:00)
        if (doctorEndMinutes <= doctorStartMinutes) {
            doctorEndMinutes += 24 * 60;
        }

        // Calculate the next available slot based on existing appointments
        let nextSlotStartMinutes = doctorStartMinutes;

        if (existingAppointments.length > 0) {
            const lastAppointment = existingAppointments[existingAppointments.length - 1];
            const lastApptStart = timeToMinutes(lastAppointment.time);
            const lastApptDuration = lastAppointment.appointmentType ? lastAppointment.appointmentType.duration : 30;
            // FIX: Ensure next slot is at least at the start of the doctor's shift
            nextSlotStartMinutes = Math.max(doctorStartMinutes, lastApptStart + lastApptDuration);
        }

        // -------------------------------------------------------
        // CHECK IF SELECTED DATE IS TODAY
        // -------------------------------------------------------
        // Use moment to get today's date string (server time)
        const todayString = moment().format('YYYY-MM-DD');
        
        if (date === todayString) {
            const todayDate = new Date();
            const currentMinutes = todayDate.getHours() * 60 + todayDate.getMinutes();
            
            // Add a small buffer (e.g., 15 minutes) to ensure users don't book for "right now"
            const bookingBuffer = 15; 
            
            if (nextSlotStartMinutes < currentMinutes + bookingBuffer) {
                // Round up to nearest 5 minutes for cleaner times
                let adjustedTime = currentMinutes + bookingBuffer;
                const remainder = adjustedTime % 5;
                if (remainder !== 0) {
                    adjustedTime += (5 - remainder);
                }
                nextSlotStartMinutes = adjustedTime;
            }
        }
        // -------------------------------------------------------

        // Ensure the calculated next slot plus duration fits within the doctor's shift
        if (nextSlotStartMinutes + requestedDuration > doctorEndMinutes) {
             return res.json({ nextAvailableTime: null, message: 'Doctor schedule is full for this day.' });
        }

        const nextAvailableTime = minutesToTime(nextSlotStartMinutes);
        const queuePosition = existingAppointments.length + 1;

        res.json({ 
            nextAvailableTime, 
            queuePosition,
            message: `Available`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error while fetching slots' });
    }
});


module.exports = router;
