const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Hospital = require('../models/hospital');
const Wallet = require('../models/wallet');
const Specialty = require('../models/specialty');
const Appointment = require('../models/appointment');
const { protect, authorize, optionalProtect } = require('../middleware/auth');
const mongoose = require('mongoose');
const moment = require('moment');
const AccountDeletionService = require('../services/accountDeletionService');
const AccountDisableService = require('../services/accountDisableService');
const ExternalNotificationService = require('../services/externalNotificationService');
const walletService = require('../services/walletService');
const { createNotification } = require('../utils/notificationHelper');

// @desc    Get all users (Admin/Manager)
// @route   GET /api/users
// @access  Private (Admin/Manager)
router.get('/', protect, authorize('hospital manager', 'super admin', 'hospital staff'), async (req, res) => {
    try {
        const { search } = req.query;
        let query = {};

        // If not super admin, restrict to users in the manager's/staff's assigned hospitals
        if (req.user.role !== 'super admin') {
            // Get IDs of hospitals the current user belongs to
            const hospitalIds = req.user.hospitals;
            
            if (hospitalIds && hospitalIds.length > 0) {
                // Find users who have at least one hospital in common with the manager
                // AND exclude Super Admins from their view
                query = { 
                    hospitals: { $in: hospitalIds },
                    role: { $ne: 'super admin' } 
                };
            } else {
                // If manager has no hospital assigned, return empty
                return res.json([]);
            }
        }

        // Add search functionality
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$and = query.$and || [];
            query.$and.push({
                $or: [
                    { 'name.en': searchRegex },
                    { 'name.ar': searchRegex },
                    { email: searchRegex },
                    { phone: searchRegex }
                ]
            });
        }

        const users = await User.find(query)
            .populate('hospitals', 'name')
            .populate('specialties', 'name') // Populate specialties to show in Admin table
            .sort({ createdAt: -1 });
            
        const now = new Date();
        const results = users.map(user => {
            const userObj = user.toObject();
            if (userObj.role === 'doctor') {
                const episodes = userObj.unavailabilityEpisodes || [];
                const activeEpisode = episodes.find(ep => {
                    if (!ep.startDate || !ep.endDate) return false;
                    const start = new Date(ep.startDate);
                    const end = new Date(ep.endDate);
                    return start <= now && end >= now;
                });
                
                if (activeEpisode) {
                    userObj.isCurrentlyUnavailable = true;
                    userObj.unavailabilityStatus = {
                        reason: activeEpisode.reason,
                        until: activeEpisode.endDate
                    };
                } else {
                    userObj.isCurrentlyUnavailable = false;
                }
            }
            return userObj;
        });

        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get a single doctor by ID
// @route   GET /api/users/doctors/:id
// @access  Public / Private
router.get('/doctors/:id', optionalProtect, async (req, res) => {
    try {
        const doctor = await User.findById(req.params.id)
            .populate('hospitals')
            .populate('specialties');

        if (!doctor || doctor.role !== 'doctor' || doctor.isDisabled) {
            return res.status(404).json({ error: 'Doctor not found' });
        }

        const doctorObj = doctor.toObject();
        const now = new Date();
        const episodes = doctorObj.unavailabilityEpisodes || [];
        const activeEpisode = episodes.find(ep => {
            if (!ep.startDate || !ep.endDate) return false;
            const start = new Date(ep.startDate);
            const end = new Date(ep.endDate);
            return start <= now && end >= now;
        });

        if (activeEpisode) {
            doctorObj.isCurrentlyUnavailable = true;
            doctorObj.unavailabilityStatus = {
                reason: activeEpisode.reason,
                until: activeEpisode.endDate
            };
        } else {
            doctorObj.isCurrentlyUnavailable = false;
        }

        res.json(doctorObj);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get doctors (with search)
// @route   GET /api/users/doctors
// @access  Public / Private
router.get('/doctors', optionalProtect, async (req, res) => {
    try {
        const { search, specialtyId, hospitalId, city, gender, timeSlot } = req.query;
        let query = { role: 'doctor', isActive: true, isDisabled: false };

        // Patients, Guests, Super Admins, and even Staff can see all doctors for search purposes.
        // We only filter by hospital if specifically requested.
        if (hospitalId) {
            query.hospitals = hospitalId;
        }

        if (specialtyId) {
            query.specialties = specialtyId;
        }

        if (gender) {
            query.gender = gender;
        }

        if (city) {
            // Find hospitals in that city
            const hospitalsInCity = await Hospital.find({ city: new RegExp(city, 'i') }).select('_id');
            const hospitalIds = hospitalsInCity.map(h => h._id);
            
            if (query.hospitals) {
                // If already filtering by hospital, intersect
                if (query.hospitals.$in) {
                    query.hospitals.$in = query.hospitals.$in.filter(id => hospitalIds.some(hId => hId.equals(id)));
                } else {
                    const currentId = query.hospitals;
                    if (!hospitalIds.some(hId => hId.equals(currentId))) {
                        return res.json([]); // No match
                    }
                }
            } else {
                query.hospitals = { $in: hospitalIds };
            }
        }

        if (timeSlot) {
            if (timeSlot === 'morning') {
                // Morning: startTime < 12:00
                query.availability = {
                    $elemMatch: {
                        isAvailable: true,
                        startTime: { $lt: '12:00' }
                    }
                };
            } else if (timeSlot === 'evening') {
                // Evening: startTime >= 12:00
                query.availability = {
                    $elemMatch: {
                        isAvailable: true,
                        startTime: { $gte: '12:00' }
                    }
                };
            }
        }

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            
            // 1. Find specialties matching the search term
            const matchingSpecialties = await Specialty.find({
                $or: [
                    { "name.en": searchRegex },
                    { "name.ar": searchRegex }
                ]
            }).select('_id');
            const specialtyIds = matchingSpecialties.map(s => s._id);

            // 2. Query doctors matching name OR having one of the matching specialties
            query.$or = [
                { "name.en": searchRegex },
                { "name.ar": searchRegex },
                { specialties: { $in: specialtyIds } }
            ];
        }

        const doctors = await User.find(query)
            .populate('hospitals', 'name address')
            .populate('specialties', 'name')
            .select('-password');
            
        const now = new Date();
        const doctorsWithClinics = doctors.map(doc => {
            const docObj = doc.toObject();
            docObj.clinics = docObj.hospitals;

            // Add current unavailability status
            const episodes = docObj.unavailabilityEpisodes || [];
            const activeEpisode = episodes.find(ep => {
                if (!ep.startDate || !ep.endDate) return false;
                const start = new Date(ep.startDate);
                const end = new Date(ep.endDate);
                return start <= now && end >= now;
            });
            
            if (activeEpisode) {
                docObj.isCurrentlyUnavailable = true;
                docObj.unavailabilityStatus = {
                    reason: activeEpisode.reason,
                    until: activeEpisode.endDate
                };
            } else {
                docObj.isCurrentlyUnavailable = false;
            }

            return docObj;
        });

        res.json(doctorsWithClinics);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Create a user (Admin/Manager)
// @route   POST /api/users
// @access  Private
router.post('/', protect, authorize('hospital manager', 'super admin'), async (req, res) => {
    try {
        const { name, email, password, phone, role, hospitals, specialties, dateOfBirth } = req.body;
        
        let assignedHospitals = hospitals;

        // Hospital Managers can only create staff/doctors for their own hospital
        if (req.user.role === 'hospital manager') {
            if (!['doctor', 'hospital staff', 'patient'].includes(role)) {
                return res.status(403).json({ error: 'Managers can only create doctors, staff, or patients.' });
            }
            // Force assignment to manager's hospital(s)
            assignedHospitals = req.user.hospitals;
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Handle name format
        const nameData = typeof name === 'string' ? { en: name, ar: name } : name;

        const user = await User.create({
            name: nameData,
            email,
            password,
            phone,
            role,
            dateOfBirth,
            hospitals: assignedHospitals,
            specialties: role === 'doctor' ? specialties : [], // Only assign specialties if doctor
            isActive: true 
        });

        // Create wallet for patients
        if (role === 'patient') {
            await Wallet.create({ user: user._id });
        }

        // Return populated user
        const populatedUser = await User.findById(user._id)
            .populate('hospitals', 'name')
            .populate('specialties', 'name');

        res.status(201).json(populatedUser);
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ error: 'Email already exists' });
        res.status(500).json({ error: error.message || 'Server Error' });
    }
});

// @desc    Register a patient (Staff)
// @route   POST /api/users/patient
// @access  Private (Staff/Manager/Admin)
router.post('/patient', protect, authorize('hospital staff', 'hospital manager', 'super admin'), async (req, res) => {
    try {
        const { name, phone, dateOfBirth } = req.body;
        
        const email = `patient.${Date.now()}@myclinic.local`;
        const password = 'Password123'; 

        const nameData = typeof name === 'string' ? { en: name, ar: name } : name;

        const user = await User.create({
            name: nameData,
            email,
            password,
            phone,
            dateOfBirth,
            role: 'patient',
            isActive: true
        });

        await Wallet.create({ user: user._id });

        res.status(201).json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('hospitals', 'name')
            .populate({ path: 'availability', populate: { path: 'hospital', model: 'Hospital', select: 'name' } });
            
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
router.put('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (req.body.name) {
            user.name.en = req.body.name;
            user.name.ar = req.body.name; 
        }
        if (req.body.email) user.email = req.body.email;
        if (req.body.phone) user.phone = req.body.phone;
        if (req.body.dateOfBirth) user.dateOfBirth = req.body.dateOfBirth;
        
        if (req.body.medicalProfile) {
            user.medicalProfile = { ...user.medicalProfile, ...req.body.medicalProfile };
        }

        const updatedUser = await user.save();
        
        const populated = await User.findById(updatedUser._id)
            .populate('hospitals', 'name')
            .populate({ path: 'availability', populate: { path: 'hospital', model: 'Hospital', select: 'name' } });

        res.json(populated);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Send OTP for account deletion verification
// @route   POST /api/users/profile/delete/request-otp
// @access  Private
router.post('/profile/delete/request-otp', protect, async (req, res) => {
    try {
        if (req.user.role === 'super admin') {
            return res.status(403).json({ error: 'Super Admins cannot delete their own account via this interface.' });
        }

        await AccountDeletionService.generateDeletionOtp(req.user._id);
        res.status(200).json({ 
            success: true, 
            message: 'Verification code sent to your email. Please check your inbox.' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send verification code' });
    }
});

// @desc    Delete own account (with password or OTP verification)
// @route   DELETE /api/users/profile
// @access  Private
router.delete('/profile', protect, async (req, res) => {
    try {
        if (req.user.role === 'super admin') {
            return res.status(403).json({ error: 'Super Admins cannot delete their own account via this interface.' });
        }

        const { password, otp } = req.body;

        // Require either password or OTP
        if (!password && !otp) {
            return res.status(400).json({ 
                error: 'Password or OTP verification is required for account deletion' 
            });
        }

        let isVerified = false;

        // Verify password if provided
        if (password) {
            isVerified = await AccountDeletionService.verifyPassword(req.user._id, password);
            if (!isVerified) {
                return res.status(401).json({ error: 'Incorrect password' });
            }
        }

        // Verify OTP if provided
        if (otp) {
            isVerified = await AccountDeletionService.verifyDeletionOtp(req.user._id, otp);
            if (!isVerified) {
                return res.status(401).json({ error: 'Invalid or expired verification code' });
            }
        }

        if (!isVerified) {
            return res.status(401).json({ error: 'Verification failed' });
        }

        // Perform cascade deletion
        const result = await AccountDeletionService.deleteAccount(
            req.user._id, 
            req.user._id, 
            'self'
        );

        res.status(200).json({ 
            success: true, 
            message: 'Account and all related data deleted successfully',
            data: result
        });
    } catch (error) {
        console.error('Account deletion error:', error);
        res.status(500).json({ error: 'Failed to delete account. Please try again later.' });
    }
});

// @desc    Update profile picture
// @route   PUT /api/users/profile/picture
// @access  Private
router.put('/profile/picture', protect, async (req, res) => {
    try {
        const { avatar } = req.body; 
        if (!avatar) return res.status(400).json({ error: 'No image provided' });

        const user = await User.findById(req.user._id);
        user.avatar = avatar;
        await user.save();

        const populated = await User.findById(user._id)
            .populate('hospitals', 'name')
            .populate({ path: 'availability', populate: { path: 'hospital', model: 'Hospital', select: 'name' } });

        res.json(populated);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Change password
// @route   PUT /api/users/change-password
// @access  Private
router.put('/change-password', protect, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id).select('+password');

        if (!(await user.matchPassword(currentPassword))) {
            return res.status(401).json({ error: 'Incorrect current password' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get doctor's availability
// @route   GET /api/users/availability
// @access  Private (Doctor/Manager/Admin)
router.get('/availability', protect, async (req, res) => {
    try {
        const userId = req.query.userId || req.user._id;
        
        const user = await User.findById(userId)
            .populate({ path: 'availability.hospital', select: 'name' });
            
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Authorization check
        if (req.user.role === 'doctor' && req.user._id.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Not authorized to view this availability.' });
        }

        if (req.user.role === 'hospital manager') {
            const managerHospitalId = req.user.hospitals?.[0]?.toString();
            const doctorHospitalIds = user.hospitals.map(h => h.toString());
            
            if (!managerHospitalId || !doctorHospitalIds.includes(managerHospitalId)) {
                return res.status(403).json({ error: 'Not authorized to view this doctor.' });
            }
        }

        res.json(user.availability || []);
    } catch (error) {
        console.error("Get Availability Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Update doctor's availability
// @route   PUT /api/users/availability
// @access  Private (Manager/Admin ONLY)
router.put('/availability', protect, authorize('hospital manager', 'super admin'), async (req, res) => {
    try {
        const { availability, userId } = req.body;

        if (!Array.isArray(availability) || availability.length !== 7) {
            return res.status(400).json({ error: 'Invalid availability data provided.' });
        }
        
        if (!userId) {
            return res.status(400).json({ error: 'Target user ID is required.' });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid User ID format.' });
        }
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Ensure Manager owns the doctor
        let managerHospitalId = null;
        if (req.user.role === 'hospital manager') {
             managerHospitalId = req.user.hospitals?.[0]?.toString();
             const doctorHospitalIds = user.hospitals.map(h => h.toString());
             
             if (!managerHospitalId || !doctorHospitalIds.includes(managerHospitalId)) {
                 return res.status(403).json({ error: 'Not authorized to edit this doctor.' });
             }
        }
        
        const sanitizedAvailability = availability.map((day, index) => {
            const hospitalId = (day.hospital && mongoose.Types.ObjectId.isValid(day.hospital)) ? day.hospital.toString() : null;
            
            // RBAC: Hospital Manager Restrictions
            if (req.user.role === 'hospital manager') {
                const existingDay = user.availability[index];
                const existingHospitalId = existingDay?.hospital?.toString();

                // 1. If the day was already assigned to ANOTHER hospital, the manager cannot change it.
                if (existingHospitalId && existingHospitalId !== managerHospitalId) {
                    // Revert to existing values for this day to prevent unauthorized changes
                    return existingDay;
                }

                // 2. If the manager is trying to assign it to a hospital other than their own, force it to their own or null.
                if (hospitalId && hospitalId !== managerHospitalId) {
                    return {
                        ...day,
                        hospital: managerHospitalId // Force to manager's hospital
                    };
                }
            }

            return {
                ...day,
                hospital: hospitalId || undefined
            };
        });
        
        user.availability = sanitizedAvailability;
        await user.save();
        
        res.status(200).json(user.availability);
    } catch (error) {
        console.error("Availability Update Error:", error);
        
        if (error.name === 'ValidationError') {
             const messages = Object.values(error.errors).map(val => val.message);
             return res.status(400).json({ error: messages.join('. ') });
        }
        if (error.name === 'CastError') {
             return res.status(400).json({ error: `Invalid data format: ${error.message}` });
        }

        res.status(500).json({ error: error.message || 'Server Error during availability update' });
    }
});

// @desc    Update any user (Admin/Manager)
// @route   PUT /api/users/:id
// @access  Private (Admin/Manager)
router.put('/:id', protect, authorize('hospital manager', 'super admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // If Hospital Manager, verify they own this user (share a hospital)
        if (req.user.role === 'hospital manager') {
             const managerHospitals = req.user.hospitals.map(h => h.toString());
             const userHospitals = user.hospitals.map(h => h.toString());
             const hasCommon = managerHospitals.some(id => userHospitals.includes(id));
             
             if (!hasCommon && user.role !== 'patient') { 
                 return res.status(403).json({ error: 'Not authorized to edit this user.' });
             }
        }

        // Update fields
        if (req.body.name) {
            user.name.en = req.body.name;
            user.name.ar = req.body.name;
        }
        if (req.body.email) user.email = req.body.email;
        if (req.body.phone) user.phone = req.body.phone;
        if (req.body.dateOfBirth) user.dateOfBirth = req.body.dateOfBirth;
        if (req.body.role) user.role = req.body.role;
        
        if (req.body.hospitals) user.hospitals = req.body.hospitals;
        
        if (req.body.specialties) user.specialties = req.body.specialties;

        if (req.body.password) user.password = req.body.password; 

        const updatedUser = await user.save();
        
        // Populate for return
        const populatedUser = await User.findById(updatedUser._id)
            .populate('hospitals', 'name')
            .populate('specialties', 'name');

        res.json(populatedUser);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Server Error' });
    }
});

// @desc    Toggle user active status
// @route   PUT /api/users/:id/toggle-status
// @access  Private (Super Admin)
router.put('/:id/toggle-status', protect, authorize('super admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ error: 'Cannot deactivate your own account' });
        }

        user.isActive = !user.isActive;
        await user.save();
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Disable own account
// @route   POST /api/users/profile/disable
// @access  Private
router.post('/profile/disable', protect, async (req, res) => {
    try {
        if (req.user.role === 'super admin') {
            return res.status(403).json({ error: 'Super Admins cannot disable their own account via this interface.' });
        }

        const { reason } = req.body;

        const result = await AccountDisableService.disableAccount(
            req.user._id,
            req.user._id,
            reason || '',
            'self'
        );

        res.status(200).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to disable account' });
    }
});

// @desc    Request reactivation OTP
// @route   POST /api/users/profile/reactivate/request-otp
// @access  Public (for disabled users)
router.post('/profile/reactivate/request-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            // Don't reveal if user exists for security
            return res.status(200).json({ 
                success: true, 
                message: 'If an account with this email exists and is disabled, a reactivation code has been sent.' 
            });
        }

        if (!user.isDisabled) {
            return res.status(400).json({ error: 'Account is not disabled' });
        }

        await AccountDisableService.generateReactivationOtp(user._id);
        res.status(200).json({ 
            success: true, 
            message: 'If an account with this email exists and is disabled, a reactivation code has been sent.' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send reactivation code' });
    }
});

// @desc    Reactivate account with OTP
// @route   POST /api/users/profile/reactivate
// @access  Public (for disabled users)
router.post('/profile/reactivate', async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'Invalid email or OTP' });
        }

        const isValid = await AccountDisableService.verifyReactivationOtp(user._id, otp);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid or expired verification code' });
        }

        res.status(200).json({ 
            success: true, 
            message: 'Account reactivated successfully. You can now log in.' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to reactivate account' });
    }
});

// @desc    Get doctor reminder preferences
// @route   GET /api/users/profile/doctor-reminders
// @access  Private (Doctor)
router.get('/profile/doctor-reminders', protect, authorize('doctor'), async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('doctorReminderPreferences');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({
            success: true,
            preferences: user.doctorReminderPreferences || {
                enabled: true,
                reminder24h: true,
                reminder1h: true
            }
        });
    } catch (error) {
        console.error("Get Doctor Reminder Preferences Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Update doctor reminder preferences
// @route   PUT /api/users/profile/doctor-reminders
// @access  Private (Doctor)
router.put('/profile/doctor-reminders', protect, authorize('doctor'), async (req, res) => {
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
        user.doctorReminderPreferences = {
            ...user.doctorReminderPreferences,
            ...preferences
        };
        await user.save({ validateBeforeSave: false });

        res.status(200).json({
            success: true,
            message: 'Doctor reminder preferences updated successfully',
            preferences: user.doctorReminderPreferences
        });
    } catch (error) {
        console.error("Update Doctor Reminder Preferences Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Disable user account (Admin)
// @route   POST /api/users/:id/disable
// @access  Private (Admin)
router.post('/:id/disable', protect, authorize('super admin', 'hospital manager'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ error: 'Cannot disable your own account' });
        }

        // Hospital managers can only disable users from their hospitals
        if (req.user.role === 'hospital manager') {
            const managerHospitals = (req.user.hospitals || []).map(h => h.toString());
            const userHospitals = (user.hospitals || []).map(h => h.toString());
            const hasCommon = managerHospitals.some(id => userHospitals.includes(id));
            
            if (!hasCommon && user.role !== 'patient') {
                return res.status(403).json({ error: 'Not authorized to disable this user' });
            }
        }

        const { reason } = req.body;

        const result = await AccountDisableService.disableAccount(
            user._id,
            req.user._id,
            reason || '',
            'admin'
        );

        res.status(200).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to disable account' });
    }
});

// @desc    Reactivate user account (Admin)
// @route   POST /api/users/:id/reactivate
// @access  Private (Admin)
router.post('/:id/reactivate', protect, authorize('super admin', 'hospital manager'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Hospital managers can only reactivate users from their hospitals
        if (req.user.role === 'hospital manager') {
            const managerHospitals = req.user.hospitals.map(h => h.toString());
            const userHospitals = user.hospitals.map(h => h.toString());
            const hasCommon = managerHospitals.some(id => userHospitals.includes(id));
            
            if (!hasCommon && user.role !== 'patient') {
                return res.status(403).json({ error: 'Not authorized to reactivate this user' });
            }
        }

        const result = await AccountDisableService.reactivateAccount(
            user._id,
            req.user._id
        );

        res.status(200).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to reactivate account' });
    }
});

// @desc    Mark doctor as unavailable for a period
// @route   POST /api/users/doctors/:id/unavailability
// @access  Private (Admin)
router.post('/doctors/:id/unavailability', protect, authorize('super admin', 'hospital manager'), async (req, res) => {
    try {
        const { unavailableUntil, reason } = req.body;
        
        if (!unavailableUntil) {
            return res.status(400).json({ error: 'Please provide an end date for the unavailability period.' });
        }

        const endDate = new Date(unavailableUntil);
        if (isNaN(endDate.getTime())) {
            return res.status(400).json({ error: 'Invalid date provided.' });
        }

        const doctor = await User.findById(req.params.id);

        if (!doctor || doctor.role !== 'doctor') {
            return res.status(404).json({ error: 'Doctor not found' });
        }

        if (!doctor.unavailabilityEpisodes) {
            doctor.unavailabilityEpisodes = [];
        }

        doctor.unavailabilityEpisodes.push({
            startDate: new Date(),
            endDate: endDate,
            reason
        });

        await doctor.save();

        // --- DOCTOR APOLOGY LOGIC ---
        // Find and handle upcoming appointments during this period
        // Ensure we find ALL active appointments in the designated range
        const todayStr = moment().format('YYYY-MM-DD');
        const endStr = moment(endDate).format('YYYY-MM-DD');

        console.log(`[DOCTOR APOLOGY] Marking doctor ${req.params.id} unavailable from ${todayStr} to ${endStr}`);

        const affectedAppointments = await Appointment.find({
            doctor: req.params.id,
            status: { $in: ['Upcoming', 'Scheduled'] },
            date: { $gte: todayStr, $lte: endStr }
        }).populate('doctor');

        console.log(`[DOCTOR APOLOGY] Found ${affectedAppointments.length} affected appointments`);

        for (const appt of affectedAppointments) {
            console.log(`[DOCTOR APOLOGY] Cancelling appointment ${appt._id} for date ${appt.date}`);
            appt.status = 'DoctorCancelled';
            appt.cancellationResolution = 'Pending';
            await appt.save();

            // Create notification (in-app + external)
            try {
                await createNotification(
                    appt.user,
                    'appointment_cancelled',
                    {
                        en: `Dr. ${appt.doctor.name.en} has apologized for the appointment on ${appt.date}. Please open the app to choose a resolution.`,
                        ar: `نعتذر منك، لقد تعذر حضور الدكتور ${appt.doctor.name.ar || appt.doctor.name.en} لموعدكم يوم ${appt.date}. يرجى الدخول للتطبيق لاختيار بديل.`
                    },
                    {
                        title: {
                            en: 'Appointment Cancelled by Doctor',
                            ar: 'تنبيه: اعتذار طبيب'
                        },
                        language: 'ar',
                        data: {
                            type: 'doctor_apology',
                            appointmentId: appt._id.toString()
                        }
                    }
                );
            } catch (notifyErr) {
                console.error(`[DOCTOR APOLOGY] Notification failed for ${appt._id}:`, notifyErr.message);
            }
        }

        res.status(200).json({ success: true, doctor, affectedCount: affectedAppointments.length });
    } catch (error) {
        console.error('Mark Unavailable Error:', error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Restore doctor availability (clear current/future unavailability)
// @route   POST /api/users/doctors/:id/availability/restore
// @access  Private (Admin)
router.post('/doctors/:id/availability/restore', protect, authorize('super admin', 'hospital manager'), async (req, res) => {
    try {
        const doctor = await User.findById(req.params.id);

        if (!doctor || doctor.role !== 'doctor') {
            return res.status(404).json({ error: 'Doctor not found' });
        }

        const now = new Date();
        // Clear episodes that haven't ended yet
        doctor.unavailabilityEpisodes = (doctor.unavailabilityEpisodes || []).filter(ep => ep.endDate < now);

        await doctor.save();
        res.status(200).json({ success: true, doctor });
    } catch (error) {
        console.error('Restore Availability Error:', error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Add funds to user wallet (Admin)
// @route   POST /api/users/:id/add-funds
// @access  Private (Admin)
router.post('/:id/add-funds', protect, authorize('hospital manager', 'super admin'), async (req, res) => {
    try {
        const { amount, description } = req.body;
        const parsedAmount = parseFloat(amount);

        if (!parsedAmount || parsedAmount <= 0) {
            return res.status(400).json({ error: 'Please provide a valid positive amount.' });
        }

        const wallet = await Wallet.findOne({ user: req.params.id });
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

        // Use wallet service to handle transaction and balance update
        const transactionData = {
            userId: req.params.id,
            amount: parsedAmount,
            type: 'credit',
            transactionType: 'Deposit',
            description: description || `Admin deposit.`,
            referenceId: `ADMIN_DEPOSIT_${Date.now()}`
        };

        await walletService.createTransactionAndUpdateWallet(transactionData);
        
        // Create notification (in-app + external)
        await createNotification(
            req.params.id,
            'wallet',
            {
                en: `Your wallet has been credited with ${parsedAmount.toFixed(2)} LYD by administration.`,
                ar: `تم شحن محفظتك بمبلغ ${parsedAmount.toFixed(2)} دينار من قبل الإدارة.`
            },
            {
                title: {
                    en: 'Wallet Credited',
                    ar: 'تم شحن المحفظة'
                },
                language: 'ar',
                data: {
                    amount: parsedAmount.toFixed(2),
                    link: `#/wallet`
                }
            }
        );

        const updatedWallet = await Wallet.findOne({ user: req.params.id });
        res.json({ success: true, balance: updatedWallet.balance });
    } catch (error) {
        console.error('Add funds error:', error);
        res.status(500).json({ error: error.message || 'Server Error' });
    }
});

// @desc    Send OTP for admin account deletion verification
// @route   POST /api/users/:id/delete/request-otp
// @access  Private (Admin)
router.post('/:id/delete/request-otp', protect, authorize('super admin', 'hospital manager'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Hospital managers can only delete users from their hospitals
        if (req.user.role === 'hospital manager') {
            const managerHospitals = req.user.hospitals.map(h => h.toString());
            const userHospitals = user.hospitals.map(h => h.toString());
            const hasCommon = managerHospitals.some(id => userHospitals.includes(id));
            
            if (!hasCommon && user.role !== 'patient') {
                return res.status(403).json({ error: 'Not authorized to delete this user' });
            }
        }

        await AccountDeletionService.generateDeletionOtp(user._id);
        res.status(200).json({ 
            success: true, 
            message: 'Verification code sent to user\'s email.' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send verification code' });
    }
});

// @desc    Delete user (Admin - with password or OTP verification)
// @route   DELETE /api/users/:id
// @access  Private (Admin)
router.delete('/:id', protect, authorize('super admin', 'hospital manager'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ error: 'Cannot delete your own account. Use the profile deletion endpoint instead.' });
        }

        // Hospital managers can only delete users from their hospitals
        if (req.user.role === 'hospital manager') {
            const managerHospitals = req.user.hospitals.map(h => h.toString());
            const userHospitals = user.hospitals.map(h => h.toString());
            const hasCommon = managerHospitals.some(id => userHospitals.includes(id));
            
            if (!hasCommon && user.role !== 'patient') {
                return res.status(403).json({ error: 'Not authorized to delete this user' });
            }
        }

        const { password, otp } = req.body;

        // Require either admin password or OTP
        if (!password && !otp) {
            return res.status(400).json({ 
                error: 'Admin password or OTP verification is required for account deletion' 
            });
        }

        let isVerified = false;

        // Verify admin password if provided
        if (password) {
            isVerified = await AccountDeletionService.verifyPassword(req.user._id, password);
            if (!isVerified) {
                return res.status(401).json({ error: 'Incorrect admin password' });
            }
        }

        // Verify OTP if provided
        if (otp) {
            isVerified = await AccountDeletionService.verifyDeletionOtp(user._id, otp);
            if (!isVerified) {
                return res.status(401).json({ error: 'Invalid or expired verification code' });
            }
        }

        if (!isVerified) {
            return res.status(401).json({ error: 'Verification failed' });
        }

        // Perform cascade deletion
        const result = await AccountDeletionService.deleteAccount(
            user._id,
            req.user._id,
            'admin'
        );

        res.status(200).json({ 
            success: true, 
            message: 'User account and all related data deleted successfully',
            data: result
        });
    } catch (error) {
        console.error('Account deletion error:', error);
        res.status(500).json({ error: 'Failed to delete account. Please try again later.' });
    }
});

// @desc    Toggle favorite hospital
// @route   POST /api/users/favorites/hospitals/:id
// @access  Private
router.post('/favorites/hospitals/:id', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const hospitalId = req.params.id;

        if (!user.favoriteHospitals) {
            user.favoriteHospitals = [];
        }

        const index = user.favoriteHospitals.indexOf(hospitalId);
        if (index === -1) {
            user.favoriteHospitals.push(hospitalId);
        } else {
            user.favoriteHospitals.splice(index, 1);
        }

        await user.save();
        res.json({ success: true, favoriteHospitals: user.favoriteHospitals });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Toggle favorite doctor
// @route   POST /api/users/favorites/doctors/:id
// @access  Private
router.post('/favorites/doctors/:id', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const doctorId = req.params.id;

        if (!user.favoriteDoctors) {
            user.favoriteDoctors = [];
        }

        const index = user.favoriteDoctors.indexOf(doctorId);
        if (index === -1) {
            user.favoriteDoctors.push(doctorId);
        } else {
            user.favoriteDoctors.splice(index, 1);
        }

        await user.save();
        res.json({ success: true, favoriteDoctors: user.favoriteDoctors });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;