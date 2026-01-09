
const express = require('express');
const router = express.Router();
const User = require('../models/user');
const PendingUser = require('../models/pendingUser');
const Wallet = require('../models/wallet');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail');

// @desc    Register user
// @route   POST /api/auth/register
router.post('/register', async (req, res) => {
    const { name, email, password, phone, age, role } = req.body;

    // Basic validation
    if (!name || !email || !password || !phone) {
        return res.status(400).json({ error: 'Please provide name, email, phone, and password' });
    }

    try {
        // Check if user already exists in main User collection
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Handle name format: User model expects { en: string, ar: string }
        const nameData = typeof name === 'string' ? { en: name, ar: name } : name;

        // Generate OTP for registration verification
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

        // Check if there's already a pending registration for this email
        let pendingUser = await PendingUser.findOne({ email });
        
        if (pendingUser) {
            // Update existing pending registration
            pendingUser.name = nameData;
            pendingUser.password = password;
            pendingUser.phone = phone;
            pendingUser.age = age;
            pendingUser.role = role || 'patient';
            pendingUser.otp = otp;
            pendingUser.otpExpire = otpExpire;
            await pendingUser.save();
        } else {
            // Create new pending registration
            pendingUser = new PendingUser({
                name: nameData,
                email,
                password,
                phone,
                age,
                role: role || 'patient',
                otp,
                otpExpire
            });
            await pendingUser.save();
        }

        // Log OTP to console for Dev/Debugging
        console.log(`>>> REGISTRATION OTP for ${email}: ${otp}`);

        // --- Email Sending ---
        try {
            await sendEmail({
                email: email,
                subject: 'MyClinic - Verify Your Account',
                html: `
                    <h1>Welcome to MyClinic</h1>
                    <p>Please use the following code to verify your account:</p>
                    <h2 style="color: #006FEE;">${otp}</h2>
                    <p>This code will expire in 10 minutes.</p>
                `
            });
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            // We still return success because the OTP is logged and can be used for testing
        }
        // ---------------------

        res.status(200).json({ success: true, message: 'Registration successful. An OTP has been sent to your email.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// @desc    Verify user registration with OTP and login
// @route   POST /api/auth/verify-registration
router.post('/verify-registration', async (req, res) => {
    const { email, otp } = req.body; 
    try {
        const pendingUser = await PendingUser.findOne({
            email, 
            otp: otp,
            otpExpire: { $gt: Date.now() }
        });

        if (!pendingUser) {
            return res.status(400).json({ error: 'Invalid OTP or it has expired.' });
        }

        // Create the actual user in the database
        const user = new User({
            name: pendingUser.name,
            email: pendingUser.email,
            password: pendingUser.password,
            phone: pendingUser.phone,
            age: pendingUser.age,
            role: pendingUser.role,
            isActive: true
        });

        await user.save();

        // Create wallet for patients
        if (user.role === 'patient') {
            try {
                await Wallet.create({ user: user._id });
            } catch (walletError) {
                console.error('Failed to create wallet for new user:', walletError);
            }
        }

        // Delete the pending registration
        await PendingUser.deleteOne({ _id: pendingUser._id });

        await sendTokenResponse(user, 200, res);

    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ error: messages.join('. ') });
        }
        console.error(error);
        res.status(500).json({ error: 'Server error during verification.' });
    }
});


// @desc    Login user
// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Please provide an email and password' });
    }

    try {
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Check if account is disabled
        if (user.isDisabled) {
            return res.status(403).json({ 
                error: 'Your account has been disabled by the administration. Please contact support. / تم تعطيل حسابك من قبل الإدارة. يرجى التواصل مع الدعم الفني للمساعدة.' 
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(403).json({ error: 'Your account has been deactivated or not verified. Please contact support.' });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
       await sendTokenResponse(user, 200, res);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        // user is available from protect middleware, re-populate to ensure consistency with login response
        const populatedUser = await User.findById(req.user._id)
            .populate('hospitals', 'name')
            .populate({ path: 'availability', populate: { path: 'hospital', model: 'Hospital', select: 'name' } });

        if (!populatedUser) {
            return res.status(404).json({ error: 'User not found.' });
        }
        
        const userResponse = {
            _id: populatedUser._id,
            name: populatedUser.name,
            email: populatedUser.email,
            phone: populatedUser.phone,
            role: populatedUser.role,
            hospitals: populatedUser.hospitals,
            isActive: populatedUser.isActive,
            isDisabled: populatedUser.isDisabled || false,
            availability: populatedUser.availability,
            avatar: populatedUser.avatar,
            medicalProfile: populatedUser.medicalProfile,
        };

        res.status(200).json({ success: true, user: userResponse });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error while fetching user profile.' });
    }
});


// @desc    Send password reset OTP via Email
// @route   POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
    const { email } = req.body; 
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'User with this email not found.' });
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        user.passwordResetOtp = otp;
        user.passwordResetOtpExpire = Date.now() + 10 * 60 * 1000;
        await user.save({ validateBeforeSave: false });

        // Log OTP to console for Dev/Debugging
        console.log(`>>> PASSWORD RESET OTP for ${email}: ${otp}`);

        // --- Email Sending ---
        await sendEmail({
            email: user.email,
            subject: 'MyClinic - Password Reset Code',
            html: `
                <p>You requested a password reset.</p>
                <p>Your verification code is:</p>
                <h2 style="color: #006FEE;">${otp}</h2>
                <p>This code expires in 10 minutes.</p>
            `
        });
        // ---------------------

        res.status(200).json({ success: true, message: 'OTP sent successfully to your email.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error while sending OTP.' });
    }
});

// @desc    Verify password reset OTP and issue a temporary token
// @route   POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body; 
    try {
        const user = await User.findOne({
            email, 
            passwordResetOtp: otp,
            passwordResetOtpExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid OTP or it has expired.' });
        }

        // Clear the OTP fields
        user.passwordResetOtp = undefined;
        user.passwordResetOtpExpire = undefined;
        await user.save({ validateBeforeSave: false });

        // Generate a short-lived token for the final reset step
        const resetToken = user.getResetPasswordToken();

        res.status(200).json({ success: true, token: resetToken });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error during OTP verification.' });
    }
});


// @desc    Reset password with a temporary token
// @route   POST /api/auth/resetpassword-otp
router.post('/resetpassword-otp', async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ error: 'Token and new password are required.' });
    }

    try {
        // Verify the temporary reset token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(400).json({ error: 'Invalid token or user does not exist.' });
        }

        // Set new password
        user.password = password;
        await user.save(); // pre-save hook will hash it
        
        // Log the user in by sending a new session token
        await sendTokenResponse(user, 200, res);

    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
             return res.status(401).json({ error: 'Your session has expired. Please start the password reset process again.' });
        }
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ error: messages.join(' ') });
        }
        res.status(500).json({ error: 'Server error during password reset.' });
    }
});


const sendTokenResponse = async (user, statusCode, res) => {
    const token = user.getSignedJwtToken();

    // Fetch the user again to populate the hospitals field
    const populatedUser = await User.findById(user._id)
        .populate('hospitals', 'name')
        .populate({ path: 'availability', populate: { path: 'hospital', model: 'Hospital', select: 'name' } });


    const userResponse = {
        _id: populatedUser._id,
        name: populatedUser.name,
        email: populatedUser.email,
        phone: populatedUser.phone,
        role: populatedUser.role,
        hospitals: populatedUser.hospitals,
        favoriteHospitals: populatedUser.favoriteHospitals,
        isActive: populatedUser.isActive,
        availability: populatedUser.availability,
        avatar: populatedUser.avatar,
        medicalProfile: populatedUser.medicalProfile,
    };

    res.status(statusCode).json({ success: true, token, user: userResponse });
};


module.exports = router;
