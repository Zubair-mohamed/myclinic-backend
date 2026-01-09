const QueueItem = require('../models/queueItem');
const User = require('../models/user');
const Appointment = require('../models/appointment');
const Notification = require('../models/notification');
const moment = require('moment');

const AVERAGE_CONSULTATION_MINS = 15;

const normalizeDateString = (value) => {
    if (value == null) return null;
    const str = typeof value === 'string' ? value : value.toString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
    const m = moment(str);
    return m.isValid() ? m.format('YYYY-MM-DD') : null;
};

const getPatientQueueStatus = async (userId, userHospitals) => {
    const primaryHospitalId = userHospitals && userHospitals.length > 0 ? userHospitals[0] : null;

    let doctorQuery = { role: 'doctor' };
    if (primaryHospitalId) {
        doctorQuery.hospitals = primaryHospitalId;
    }

    // Fetch doctors with more details needed by the UI
    let doctors = await User.find(doctorQuery)
        .select('name specialty hospitals image')
        .limit(10);
    
    // Fallback: If no doctors found in primary hospital, show any doctors
    if (doctors.length === 0 && primaryHospitalId) {
        doctors = await User.find({ role: 'doctor' })
            .select('name specialty hospitals image')
            .limit(10);
    }
    
    // Fetch user's upcoming appointments (used for both display + auto-join)
    const allUpcomingAppointments = await Appointment.find({
        user: userId,
        status: 'Upcoming'
    })
        .populate('doctor', 'name specialty image hospitals')
        .populate('hospital', 'name')
        .sort({ date: 1, time: 1 });

    // Check for Waiting, Serving, OR Held status
    let userQueueEntry = await QueueItem.findOne({ user: userId, status: { $in: ['Waiting', 'Serving', 'Held'] } });

    // AUTO-JOIN LOGIC: If user has an appointment "today" but isn't in queue, add them automatically
    if (!userQueueEntry) {
        const base = moment();
        const datesToCheck = [
            base.format('YYYY-MM-DD'),
            base.clone().add(1, 'days').format('YYYY-MM-DD'),
            base.clone().subtract(1, 'days').format('YYYY-MM-DD')
        ];

        const todaysAppointment = allUpcomingAppointments.find(a => {
            const normalized = normalizeDateString(a.date);
            return normalized != null && datesToCheck.includes(normalized);
        });

        if (todaysAppointment) {
            let queueNumber = todaysAppointment.queueNumber;
            if (!queueNumber) {
                const doctor = await User.findById(todaysAppointment.doctor);
                const count = await QueueItem.countDocuments({
                    doctor: todaysAppointment.doctor,
                    hospital: todaysAppointment.hospital
                });
                queueNumber = `${doctor.name.en.charAt(0).toUpperCase()}${(count + 1).toString().padStart(3, '0')}`;
                todaysAppointment.queueNumber = queueNumber;
                await todaysAppointment.save();
            }

            try {
                const exists = await QueueItem.findOne({
                    user: userId,
                    status: { $in: ['Waiting', 'Serving', 'Held'] }
                });
                if (!exists) {
                    userQueueEntry = await QueueItem.create({
                        user: userId,
                        doctor: todaysAppointment.doctor,
                        hospital: todaysAppointment.hospital,
                        queueNumber: queueNumber,
                        status: 'Waiting'
                    });
                } else {
                    userQueueEntry = exists;
                }
            } catch (e) {
                console.error('[QUEUE] Auto-join failed:', e);
            }
        }
    }
    
    let userStatus = {
        inQueue: false,
        doctorId: null,
        position: null,
        estimatedWaitTime: 0,
        status: null
    };
    
    let nowServing = null;
    let waiting = [];

    if (userQueueEntry) {
        const waitingForDoctor = await QueueItem.find({
            doctor: userQueueEntry.doctor,
            status: 'Waiting'
        }).sort({ checkInTime: 1 }).populate('user', 'name');

        let position = 0;
        let estimatedWaitTime = 0;

        if (userQueueEntry.status === 'Waiting') {
            position = waitingForDoctor.findIndex(item => item.user?._id.toString() === userId.toString()) + 1;
            estimatedWaitTime = (position - 1) * AVERAGE_CONSULTATION_MINS;
        } else if (userQueueEntry.status === 'Held') {
            position = -1; // Special indicator for Held
            estimatedWaitTime = 0;
        }
        
        const nowServingItem = await QueueItem.findOne({ doctor: userQueueEntry.doctor, status: 'Serving' }).populate('user', 'name');
        
        // Fetch current doctor info specifically to ensure it's available even if not in the general list
        const currentDoctor = await User.findById(userQueueEntry.doctor).select('name specialty image hospitals');

        userStatus = {
            inQueue: true,
            doctorId: userQueueEntry.doctor,
            doctor: currentDoctor, // Include full doctor info here
            position: position,
            estimatedWaitTime: estimatedWaitTime,
            status: userQueueEntry.status,
            queueNumber: userQueueEntry.queueNumber,
            nowServingNumber: nowServingItem ? nowServingItem.queueNumber : '000'
        };

        nowServing = nowServingItem;
        waiting = waitingForDoctor;
    }

    // Appointments to show on Queue page
    const base = moment();
    const datesToCheck = [
        base.format('YYYY-MM-DD'),
        base.clone().add(1, 'days').format('YYYY-MM-DD'),
        base.clone().subtract(1, 'days').format('YYYY-MM-DD')
    ];

    const todaysAppointments = allUpcomingAppointments.filter(a => {
        const normalized = normalizeDateString(a.date);
        return normalized != null && datesToCheck.includes(normalized);
    });

    // If user has an appointment but it's not "today", still return it so UI isn't empty.
    // Client can label it as an upcoming appointment.
    const upcomingAppointments = allUpcomingAppointments;

    return {
        doctors,
        userStatus,
        todaysAppointments,
        upcomingAppointments,
        nowServing,
        waiting
    };
};

const getQueueHistory = async (userId) => {
    return await QueueItem.find({ user: userId })
        .populate('doctor', 'name')
        .populate('hospital', 'name')
        .sort({ createdAt: -1 });
};

const getAdminQueueInitData = async (user) => {
    const primaryHospitalId = user.hospitals && user.hospitals.length > 0 ? user.hospitals[0] : null;
    
    let hospitalQuery = {};
    if (user.role !== 'super admin') {
        if (!primaryHospitalId) throw new Error("User is not associated with a hospital.");
        hospitalQuery = { hospitals: primaryHospitalId };
    }

    const doctors = await User.find({ role: 'doctor', ...hospitalQuery }).select('name');
    
    let initialDoctorId = null;
    if (user.role === 'doctor') {
        initialDoctorId = user._id;
    } else if (doctors.length > 0) {
        initialDoctorId = doctors[0]._id;
    }

    let nowServing = null;
    let waiting = [];
    let held = [];

    if (initialDoctorId) {
        const nowServing = await QueueItem.findOne({ doctor: initialDoctorId, status: 'Serving' }).populate('user', 'name');
        const waiting = await QueueItem.find({ doctor: initialDoctorId, status: 'Waiting' }).sort({ checkInTime: 1 }).populate('user', 'name');
        const held = await QueueItem.find({ doctor: initialDoctorId, status: 'Held' }).sort({ updatedAt: -1 }).populate('user', 'name');
        
        return { 
            doctors, 
            initialDoctorId,
            nowServing, 
            waiting,
            held
        };
    }

    return { 
        doctors, 
        initialDoctorId,
        nowServing: null, 
        waiting: [],
        held: []
    };
};

const getDoctorQueue = async (doctorId, user) => {
    const primaryHospitalId = user.hospitals && user.hospitals.length > 0 ? user.hospitals[0] : null;
        
    let hospitalQuery = {};
    if (user.role !== 'super admin') {
         hospitalQuery = { hospitals: primaryHospitalId };
    }
    
    const doctors = await User.find({ role: 'doctor', ...hospitalQuery }).select('name');

    const nowServing = await QueueItem.findOne({ doctor: doctorId, status: 'Serving' }).populate('user', 'name');
    const waiting = await QueueItem.find({ doctor: doctorId, status: 'Waiting' }).sort({ checkInTime: 1 }).populate('user', 'name');
    const held = await QueueItem.find({ doctor: doctorId, status: 'Held' }).sort({ updatedAt: -1 }).populate('user', 'name');
    
    // Fetch appointments for today
    const today = new Date().toISOString().split('T')[0];
    const appointments = await Appointment.find({
        doctor: doctorId,
        date: today,
        status: 'Upcoming'
    }).populate('user', 'name').populate('hospital', 'name').populate('appointmentType', 'name').sort({ time: 1 });

    return { 
        doctors, 
        nowServing, 
        waiting, 
        held,
        appointments 
    };
};

const joinQueue = async (userId, doctorId, hospitalId) => {
    const alreadyInQueue = await QueueItem.findOne({ user: userId, status: { $in: ['Waiting', 'Serving', 'Held'] }});
    if (alreadyInQueue) {
        throw new Error('You are already in a queue.');
    }
    
    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== 'doctor' || !doctor.hospitals.map(h => h.toString()).includes(hospitalId)) {
        throw new Error('Doctor not found or not associated with this hospital.');
    }
    
    // Try to find an existing appointment for today to reuse its queue number
    const todayStr = moment().format('YYYY-MM-DD');
    const todaysAppointment = await Appointment.findOne({
        user: userId,
        doctor: doctorId, 
        hospital: hospitalId,
        status: 'Upcoming',
        date: todayStr
    });

    let queueNumber;
    if (todaysAppointment && todaysAppointment.queueNumber) {
        queueNumber = todaysAppointment.queueNumber;
    } else {
        const count = await QueueItem.countDocuments({ doctor: doctorId, hospital: hospitalId });
        queueNumber = `${doctor.name.en.charAt(0).toUpperCase()}${(count + 1).toString().padStart(3, '0')}`;
        
        // If we found an appointment but it had no queue number (legacy), save it
        if (todaysAppointment) {
            todaysAppointment.queueNumber = queueNumber;
            await todaysAppointment.save();
        }
    }

    await QueueItem.create({
        user: userId,
        doctor: doctorId,
        hospital: hospitalId,
        queueNumber,
        appointment: todaysAppointment?._id // Link if exists
    });

    return { success: true };
};

const leaveQueue = async (userId) => {
    await QueueItem.findOneAndUpdate(
        { user: userId, status: { $in: ['Waiting', 'Held'] } },
        { status: 'Left' }
    );
    return { success: true };
};

const callNextPatient = async (doctorId) => {
    // 1. Finish the current patient (if any)
    const currentServing = await QueueItem.findOne({ doctor: doctorId, status: 'Serving' });
    
    if (currentServing) {
        currentServing.status = 'Done';
        await currentServing.save();

        if (currentServing.user) {
            const today = new Date().toISOString().split('T')[0];
            await Appointment.findOneAndUpdate(
                {
                    user: currentServing.user,
                    doctor: doctorId,
                    status: 'Upcoming',
                    date: today
                },
                { status: 'Completed' }
            );
        }
    }

    // 2. Call the next patient
    const nextPatient = await QueueItem.findOneAndUpdate(
        { doctor: doctorId, status: 'Waiting' },
        { status: 'Serving' },
        { new: true, sort: { checkInTime: 1 } }
    ).populate('user', 'name').populate('walkInName');

    // 3. Notify the person *after* the new nextPatient (i.e. the one who is now first in line waiting)
    // "Get Ready" Notification for Virtual Queue
    const { createNotification } = require('../utils/notificationHelper');
    const upNext = await QueueItem.findOne({ doctor: doctorId, status: 'Waiting' }).sort({ checkInTime: 1 });
    if (upNext && upNext.user) {
        await createNotification(
            upNext.user,
            'system',
            {
                en: `Heads up! You are next in line for Dr. ${nextPatient?.doctor?.name?.en || 'the doctor'}. Please be ready.`,
                ar: `تنبيه! أنت التالي في الدور لـ د. ${nextPatient?.doctor?.name?.ar || 'الطبيب'}. يرجى الاستعداد.`
            },
            {
                title: {
                    en: 'Next in Line',
                    ar: 'دورك القادم'
                },
                language: 'ar',
                data: {
                    link: `#/queue`
                }
            }
        );
    }

    return nextPatient;
};

const holdPatient = async (queueItemId) => {
    const item = await QueueItem.findById(queueItemId);
    if (!item) throw new Error('Queue item not found');
    
    // Can only hold if Serving or Waiting
    if (!['Serving', 'Waiting'].includes(item.status)) {
        throw new Error('Cannot hold a patient with this status.');
    }

    item.status = 'Held';
    await item.save();
    return item;
};

const requeuePatient = async (queueItemId) => {
    const item = await QueueItem.findById(queueItemId);
    if (!item) throw new Error('Queue item not found');
    
    if (item.status !== 'Held') {
        throw new Error('Patient is not on hold.');
    }

    item.status = 'Waiting';
    // We keep original checkInTime to maintain some priority (or fairness)
    await item.save();
    return item;
};

const addWalkInPatient = async (name, doctorId) => {
    const doctor = await User.findById(doctorId);
    if (!doctor) throw new Error('Doctor not found.');

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDayOfWeek = weekdays[new Date().getDay()];

    const todaysAvailability = doctor.availability.find(d => d.dayOfWeek === todayDayOfWeek && d.isAvailable);
    
    let hospitalForQueue;
    if (todaysAvailability && todaysAvailability.hospital) {
        hospitalForQueue = todaysAvailability.hospital;
    } else {
        hospitalForQueue = doctor.hospitals && doctor.hospitals.length > 0 ? doctor.hospitals[0] : null;
    }

    if (!hospitalForQueue) {
        throw new Error("Could not determine the doctor's hospital for today. Please ensure they are assigned to a hospital and their schedule is set.");
    }
    
    const count = await QueueItem.countDocuments({ doctor: doctorId, hospital: hospitalForQueue });
    const queueNumber = `W${(count + 1).toString().padStart(3, '0')}`;
    
    await QueueItem.create({
        walkInName: name,
        doctor: doctorId,
        hospital: hospitalForQueue,
        queueNumber,
    });

    return { success: true };
};

const addWalkInBySpecialty = async (name, specialtyId, staffUser) => {
    const hospitalId = staffUser.hospitals && staffUser.hospitals.length > 0 ? staffUser.hospitals[0] : null;
    if (!hospitalId) {
        throw new Error("Staff member is not associated with a hospital.");
    }

    const doctors = await User.find({ role: 'doctor', hospitals: hospitalId, specialties: specialtyId });

    if (!doctors || doctors.length === 0) {
        throw new Error("No doctors available for this specialty in this hospital.");
    }

    const queueCounts = await Promise.all(
        doctors.map(async (doctor) => {
            const count = await QueueItem.countDocuments({ doctor: doctor._id, status: 'Waiting' });
            return { doctor, count };
        })
    );
    
    if (queueCounts.length === 0) {
         throw new Error("Could not retrieve queue information for doctors.");
    }

    const bestDoctor = queueCounts.reduce((min, current) => (current.count < min.count ? current : min)).doctor;

    const count = await QueueItem.countDocuments({ doctor: bestDoctor._id, hospital: hospitalId });
    const queueNumber = `W${(count + 1).toString().padStart(3, '0')}`;
    
    await QueueItem.create({
        walkInName: name,
        doctor: bestDoctor._id,
        hospital: hospitalId,
        queueNumber,
    });

    return { success: true };
};

const checkInAppointment = async (appointmentId) => {
    const appointment = await Appointment.findById(appointmentId).populate('doctor');
    if (!appointment) throw new Error('Appointment not found');

    const existingItem = await QueueItem.findOne({
        doctor: appointment.doctor._id,
        user: appointment.user,
        status: { $in: ['Waiting', 'Serving', 'Held'] }
    });

    if (existingItem) {
        throw new Error('Patient is already in the queue.');
    }

    // Use pre-assigned queue number if available, otherwise generate one
    let queueNumber = appointment.queueNumber;
    
    if (!queueNumber) {
        const count = await QueueItem.countDocuments({ doctor: appointment.doctor._id, hospital: appointment.hospital });
        queueNumber = `${appointment.doctor.name.en.charAt(0).toUpperCase()}${(count + 1).toString().padStart(3, '0')}`;
        
        // Save it back to appointment for consistency
        appointment.queueNumber = queueNumber;
        await appointment.save();
    }

    await QueueItem.create({
        user: appointment.user,
        doctor: appointment.doctor._id,
        hospital: appointment.hospital,
        queueNumber,
        status: 'Waiting'
    });

    return { success: true };
};

const removePatientFromQueue = async (queueItemId) => {
    await QueueItem.findByIdAndUpdate(queueItemId, { status: 'RemovedByAdmin' });
    return { success: true };
};

module.exports = {
    getPatientQueueStatus,
    getQueueHistory,
    getAdminQueueInitData,
    getDoctorQueue,
    joinQueue,
    leaveQueue,
    callNextPatient,
    holdPatient,
    requeuePatient,
    addWalkInPatient,
    addWalkInBySpecialty,
    checkInAppointment,
    removePatientFromQueue
};