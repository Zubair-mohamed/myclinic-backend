const User = require('../models/user');
const sendEmail = require('../utils/sendEmail');
const { createNotification } = require('../utils/notificationHelper');

/**
 * Service for handling account disable/reactivate functionality
 * Provides soft lock/deactivation without deleting user data
 */
class AccountDisableService {
    /**
     * Disable a user account (soft lock)
     * @param {String} userId - The ID of the user to disable
     * @param {String} disabledBy - The ID of the user performing the disable (for logging)
     * @param {String} reason - Optional reason for disabling
     * @param {String} disableType - 'self' or 'admin' (for logging)
     * @returns {Promise<Object>} - Result object
     */
    static async disableAccount(userId, disabledBy = null, reason = '', disableType = 'self') {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            if (user.isDisabled) {
                return {
                    success: false,
                    message: 'Account is already disabled'
                };
            }

            // Set disabled status
            user.isDisabled = true;
            user.disabledAt = new Date();
            user.disabledReason = reason || undefined;
            user.disabledBy = disabledBy || userId;
            user.reactivationOtp = undefined;
            user.reactivationOtpExpire = undefined;
            
            await user.save({ validateBeforeSave: false });

            // Send notification email (non-blocking). Email can hang if SMTP is slow/misconfigured,
            // so we fire-and-forget and never block the disable flow.
            sendEmail({
                email: user.email,
                subject: 'MyClinic - Account Disabled',
                html: `
                    <h2>Account Disabled</h2>
                    <p>Your MyClinic account has been disabled.</p>
                    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                    <p>You will not be able to access your account or receive notifications while it is disabled.</p>
                    <p>To reactivate your account, please contact support or use the account reactivation feature.</p>
                    <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated notification. Please do not reply to this email.</p>
                `
            }).catch((emailError) => {
                console.error('Failed to send disable notification email:', emailError.message);
            });

            // Log disable event
            console.log('ACCOUNT_DISABLED:', JSON.stringify({
                userId: userId.toString(),
                disabledBy: disabledBy ? disabledBy.toString() : userId.toString(),
                disableType,
                reason: reason || 'Not provided',
                timestamp: new Date().toISOString()
            }));

            // Create in-app notification
            try {
                await createNotification(userId, 'system', {
                    en: 'Your account has been disabled by the administration. Please contact support.',
                    ar: 'تم تعطيل حسابك من قبل الإدارة. يرجى التواصل مع الدعم الفني للمساعدة.'
                });
            } catch (notifError) {
                console.error('Failed to create disable notification:', notifError);
                // Don't fail the whole process if notification fails
            }

            return {
                success: true,
                message: 'Account disabled successfully',
                disabledAt: user.disabledAt
            };
        } catch (error) {
            console.error('Account disable error:', {
                userId: userId.toString(),
                error: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Generate and send OTP for account reactivation
     * @param {String} userId - User ID
     * @returns {Promise<String>} - Generated OTP
     */
    static async generateReactivationOtp(userId) {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        if (!user.isDisabled) {
            throw new Error('Account is not disabled');
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store OTP in user document
        user.reactivationOtp = otp;
        user.reactivationOtpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
        await user.save({ validateBeforeSave: false });

        // Log OTP to console for development
        console.log(`>>> ACCOUNT REACTIVATION OTP for user ${userId}: ${otp}`);

        // Send OTP via email
        try {
            await sendEmail({
                email: user.email,
                subject: 'MyClinic - Account Reactivation Code',
                html: `
                    <h2>Account Reactivation Request</h2>
                    <p>You have requested to reactivate your account. Please use the following verification code to confirm:</p>
                    <h2 style="color: #006FEE;">${otp}</h2>
                    <p><strong>This code will expire in 10 minutes.</strong></p>
                    <p>If you did not request this code, please ignore this email.</p>
                `
            });
        } catch (emailError) {
            console.error('Failed to send reactivation OTP email:', emailError.message);
            // Don't throw, the OTP is already generated and logged to console for dev
        }

        return otp;
    }

    /**
     * Verify OTP and reactivate account
     * @param {String} userId - User ID
     * @param {String} otp - OTP to verify
     * @returns {Promise<Boolean>} - True if OTP is valid and account reactivated
     */
    static async verifyReactivationOtp(userId, otp) {
        const user = await User.findById(userId);
        if (!user) {
            return false;
        }

        if (!user.isDisabled) {
            return false;
        }

        if (!user.reactivationOtp || !user.reactivationOtpExpire) {
            return false;
        }

        if (user.reactivationOtp !== otp) {
            return false;
        }

        if (Date.now() > user.reactivationOtpExpire) {
            return false;
        }

        // Reactivate account
        user.isDisabled = false;
        user.disabledAt = undefined;
        user.disabledReason = undefined;
        user.disabledBy = undefined;
        user.reactivationOtp = undefined;
        user.reactivationOtpExpire = undefined;
        await user.save({ validateBeforeSave: false });

        // Send reactivation confirmation email
        try {
            await sendEmail({
                email: user.email,
                subject: 'MyClinic - Account Reactivated',
                html: `
                    <h2>Account Reactivated</h2>
                    <p>Your MyClinic account has been successfully reactivated.</p>
                    <p>You can now log in and access all features.</p>
                    <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated notification. Please do not reply to this email.</p>
                `
            });
        } catch (emailError) {
            console.error('Failed to send reactivation confirmation email:', emailError.message);
        }

        // Log reactivation event
        console.log('ACCOUNT_REACTIVATED:', JSON.stringify({
            userId: userId.toString(),
            timestamp: new Date().toISOString()
        }));

        return true;
    }

    /**
     * Reactivate account (Admin action - no OTP required)
     * @param {String} userId - User ID
     * @param {String} reactivatedBy - Admin user ID
     * @returns {Promise<Object>} - Result object
     */
    static async reactivateAccount(userId, reactivatedBy) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            if (!user.isDisabled) {
                return {
                    success: false,
                    message: 'Account is not disabled'
                };
            }

            // Reactivate account
            user.isDisabled = false;
            user.disabledAt = undefined;
            user.disabledReason = undefined;
            user.disabledBy = undefined;
            user.reactivationOtp = undefined;
            user.reactivationOtpExpire = undefined;
            await user.save({ validateBeforeSave: false });

            // Send reactivation confirmation email
            try {
                await sendEmail({
                    email: user.email,
                    subject: 'MyClinic - Account Reactivated',
                    html: `
                        <h2>Account Reactivated</h2>
                        <p>Your MyClinic account has been reactivated by an administrator.</p>
                        <p>You can now log in and access all features.</p>
                        <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated notification. Please do not reply to this email.</p>
                    `
                });
            } catch (emailError) {
                console.error('Failed to send admin reactivation confirmation email:', emailError.message);
            }

            // Log reactivation event
            console.log('ACCOUNT_REACTIVATED_BY_ADMIN:', JSON.stringify({
                userId: userId.toString(),
                reactivatedBy: reactivatedBy ? reactivatedBy.toString() : 'system',
                timestamp: new Date().toISOString()
            }));

            return {
                success: true,
                message: 'Account reactivated successfully'
            };
        } catch (error) {
            console.error('Account reactivation error:', {
                userId: userId ? userId.toString() : 'unknown',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }
}

module.exports = AccountDisableService;

