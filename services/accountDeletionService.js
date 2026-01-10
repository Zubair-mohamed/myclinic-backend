const User = require('../models/user');
const Appointment = require('../models/appointment');
const Wallet = require('../models/wallet');
const Transaction = require('../models/transaction');
const Notification = require('../models/notification');
const MedicalReport = require('../models/medicalReport');
const Reminder = require('../models/reminder');
const QueueItem = require('../models/queueItem');
const EmergencyContact = require('../models/emergencyContact');

/**
 * Service for handling account deletion with cascade deletion of all related data
 * Logs deletion events without storing personally identifiable information
 */
class AccountDeletionService {
    /**
     * Permanently delete a user account and all related data
     * @param {String} userId - The ID of the user to delete
     * @param {String} deletedBy - The ID of the user performing the deletion (for logging)
     * @param {String} deletionType - 'self' or 'admin' (for logging)
     * @returns {Promise<Object>} - Result object with deletion statistics
     */
    static async deleteAccount(userId, deletedBy = null, deletionType = 'self') {
        const deletionLog = {
            userId: userId.toString(),
            deletedBy: deletedBy ? deletedBy.toString() : userId.toString(),
            deletionType,
            timestamp: new Date().toISOString(),
            deletedData: {}
        };

        try {
            // Start a session for transaction support (if MongoDB replica set)
            const session = await User.db.startSession();
            session.startTransaction();

            try {
                // 1. Delete Appointments (both as user and as doctor)
                const appointmentsAsUser = await Appointment.deleteMany({ user: userId }).session(session);
                const appointmentsAsDoctor = await Appointment.deleteMany({ doctor: userId }).session(session);
                deletionLog.deletedData.appointments = {
                    asUser: appointmentsAsUser.deletedCount,
                    asDoctor: appointmentsAsDoctor.deletedCount
                };

                // 2. Delete Wallet and Transactions
                const wallet = await Wallet.findOne({ user: userId }).session(session);
                if (wallet) {
                    const transactions = await Transaction.deleteMany({ wallet: wallet._id }).session(session);
                    deletionLog.deletedData.transactions = transactions.deletedCount;
                    await Wallet.deleteOne({ _id: wallet._id }).session(session);
                    deletionLog.deletedData.wallet = true;
                }

                // 3. Delete Notifications
                const notifications = await Notification.deleteMany({ user: userId }).session(session);
                deletionLog.deletedData.notifications = notifications.deletedCount;

                // 4. Delete Medical Reports (both as patient and as uploader)
                const reportsAsPatient = await MedicalReport.deleteMany({ patient: userId }).session(session);
                const reportsAsUploader = await MedicalReport.deleteMany({ uploadedBy: userId }).session(session);
                deletionLog.deletedData.medicalReports = {
                    asPatient: reportsAsPatient.deletedCount,
                    asUploader: reportsAsUploader.deletedCount
                };

                // 5. Delete Reminders
                const reminders = await Reminder.deleteMany({ user: userId }).session(session);
                deletionLog.deletedData.reminders = reminders.deletedCount;

                // 6. Delete Queue Items
                const queueItems = await QueueItem.deleteMany({ user: userId }).session(session);
                deletionLog.deletedData.queueItems = queueItems.deletedCount;

                // 7. Delete Emergency Contacts
                const emergencyContacts = await EmergencyContact.deleteMany({ user: userId }).session(session);
                deletionLog.deletedData.emergencyContacts = emergencyContacts.deletedCount;

                // 8. Delete User document (hard delete)
                await User.deleteOne({ _id: userId }).session(session);

                // Commit transaction
                await session.commitTransaction();

                // Log deletion event (without PII)
                this.logDeletion(deletionLog);

                return {
                    success: true,
                    message: 'Account and all related data deleted successfully',
                    deletedData: deletionLog.deletedData
                };
            } catch (error) {
                // Rollback transaction on error
                await session.abortTransaction();
                throw error;
            } finally {
                session.endSession();
            }
        } catch (error) {
            // Log error without PII
            console.error('Account deletion error:', {
                userId: userId.toString(),
                error: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Log deletion event without storing personally identifiable information
     * @param {Object} deletionLog - Log object with deletion details
     */
    static logDeletion(deletionLog) {
        // Log to console (in production, this could be sent to a logging service)
        console.log('ACCOUNT_DELETION:', JSON.stringify({
            userId: deletionLog.userId,
            deletedBy: deletionLog.deletedBy,
            deletionType: deletionLog.deletionType,
            timestamp: deletionLog.timestamp,
            deletedData: deletionLog.deletedData
        }));

        // In a production environment, you might want to:
        // - Send to a logging service (e.g., Winston, Bunyan, CloudWatch)
        // - Store in a separate audit log collection (without PII)
        // - Send to an analytics service
    }

    /**
     * Verify password for account deletion
     * @param {String} userId - User ID
     * @param {String} password - Password to verify
     * @returns {Promise<Boolean>} - True if password is correct
     */
    static async verifyPassword(userId, password) {
        const user = await User.findById(userId).select('+password');
        if (!user) {
            return false;
        }
        return await user.matchPassword(password);
    }

    /**
     * Generate and send OTP for account deletion verification
     * @param {String} userId - User ID
     * @returns {Promise<String>} - Generated OTP
     */
    static async generateDeletionOtp(userId) {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store OTP in user document (reuse passwordResetOtp fields)
        user.passwordResetOtp = otp;
        user.passwordResetOtpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
        await user.save({ validateBeforeSave: false });

        // Log OTP to console for development (remove in production or use secure logging)
        console.log(`>>> ACCOUNT DELETION OTP for user ${userId}: ${otp}`);

        // Send OTP via email
        const sendEmail = require('../utils/sendEmail');
        await sendEmail({
            email: user.email,
            subject: 'MyClinic - Account Deletion Verification Code',
            html: `
                <h2>Account Deletion Request</h2>
                <p>You have requested to delete your account. Please use the following verification code to confirm:</p>
                <h2 style="color: #CA3838;">${otp}</h2>
                <p><strong>This code will expire in 10 minutes.</strong></p>
                <p style="color: #CA3838;"><strong>Warning:</strong> This action cannot be undone. All your data will be permanently deleted.</p>
            `
        });

        return otp;
    }

    /**
     * Verify OTP for account deletion
     * @param {String} userId - User ID
     * @param {String} otp - OTP to verify
     * @returns {Promise<Boolean>} - True if OTP is valid
     */
    static async verifyDeletionOtp(userId, otp) {
        const user = await User.findById(userId);
        if (!user) {
            return false;
        }

        if (!user.passwordResetOtp || !user.passwordResetOtpExpire) {
            return false;
        }

        if (user.passwordResetOtp !== otp) {
            return false;
        }

        if (Date.now() > user.passwordResetOtpExpire) {
            return false;
        }

        // Clear OTP after successful verification
        user.passwordResetOtp = undefined;
        user.passwordResetOtpExpire = undefined;
        await user.save({ validateBeforeSave: false });

        return true;
    }
}

module.exports = AccountDeletionService;
