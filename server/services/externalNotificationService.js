// Optional Firebase Admin - only load if available
let admin = null;
try {
    admin = require('firebase-admin');
} catch (error) {
    console.warn('⚠️ firebase-admin not installed. Push notifications will be disabled.');
}

const sendEmail = require('../utils/sendEmail');
const User = require('../models/user');

/**
 * Service for sending external notifications (Push, SMS, Email)
 * Handles retry logic, failure handling, and respects user preferences
 */
class ExternalNotificationService {
    static initialized = false;

    /**
     * Initialize Firebase Admin SDK
     */
    static initializeFirebase() {
        if (this.initialized) {
            return;
        }

        // Check if firebase-admin is available
        if (!admin) {
            console.warn('⚠️ firebase-admin not installed. Push notifications will be disabled.');
            return;
        }

        try {
            // Initialize Firebase Admin
            if (!admin.apps.length) {
                let serviceAccount = null;

                // Option 1: Use Base64 encoded service account
                if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
                    try {
                        const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
                        serviceAccount = JSON.parse(decoded);
                    } catch (e) {
                        console.error('❌ Error decoding FIREBASE_SERVICE_ACCOUNT_BASE64:', e.message);
                    }
                }
                // Option 2: Use service account JSON string
                else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
                    try {
                        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
                    } catch (e) {
                        console.error('❌ Error parsing FIREBASE_SERVICE_ACCOUNT_KEY:', e.message);
                    }
                }
                // Option 3: Use service account file path
                else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        const fullPath = path.isAbsolute(process.env.FIREBASE_SERVICE_ACCOUNT_PATH) 
                            ? process.env.FIREBASE_SERVICE_ACCOUNT_PATH 
                            : path.join(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
                        
                        if (fs.existsSync(fullPath)) {
                            serviceAccount = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                        }
                    } catch (e) {
                        console.error('❌ Error reading FIREBASE_SERVICE_ACCOUNT_PATH:', e.message);
                    }
                }

                if (serviceAccount) {
                    admin.initializeApp({
                        credential: admin.credential.cert(serviceAccount),
                        databaseURL: process.env.FIREBASE_DATABASE_URL
                    });
                } 
                // Option 4: Use individual environment variables
                else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID) {
                    admin.initializeApp({
                        credential: admin.credential.cert({
                            projectId: process.env.FIREBASE_PROJECT_ID,
                            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                        }),
                        databaseURL: process.env.FIREBASE_DATABASE_URL
                    });
                } else {
                    console.warn('⚠️ Firebase credentials not found. Push notifications will be disabled.');
                    return;
                }
            }

            this.initialized = true;
            console.log('✅ Firebase Admin SDK initialized');
        } catch (error) {
            console.error('❌ Firebase initialization error:', error.message);
        }
    }

    /**
     * Send SMS via Twilio
     * @param {String} phoneNumber - Phone number in E.164 format
     * @param {String} message - Message to send
     * @param {String} language - Language code ('en' or 'ar')
     * @returns {Promise<Object>} - Result object
     */
    static async sendSMS(phoneNumber, message, language = 'en') {
        // Check if Twilio is configured
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
            console.warn('⚠️ Twilio not configured. SMS will not be sent.');
            return { success: false, error: 'SMS service not configured' };
        }

        try {
            // Try to load Twilio (optional dependency)
            let twilio;
            try {
                twilio = require('twilio');
            } catch (error) {
                console.warn('⚠️ twilio not installed. SMS will not be sent.');
                return { success: false, error: 'SMS service not available (twilio not installed)' };
            }

            const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

            const result = await client.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber
            });

            console.log(`✅ SMS sent to ${phoneNumber}: ${result.sid}`);
            return { success: true, messageId: result.sid };
        } catch (error) {
            console.error(`❌ SMS send error to ${phoneNumber}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send push notification via FCM
     * @param {String} fcmToken - FCM token
     * @param {Object} notification - Notification object with title, body, data
     * @param {Number} retries - Number of retries remaining
     * @returns {Promise<Object>} - Result object
     */
    static async sendPushNotification(fcmToken, notification, retries = 2) {
        // Check if firebase-admin is available
        if (!admin) {
            return { success: false, error: 'Push notifications not available (firebase-admin not installed)' };
        }

        if (!this.initialized) {
            this.initializeFirebase();
        }

        if (!this.initialized || !fcmToken) {
            return { success: false, error: 'Push notifications not available' };
        }

        try {
            const message = {
                token: fcmToken,
                notification: {
                    title: notification.title,
                    body: notification.body
                },
                data: notification.data || {},
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        channelId: 'myclinic_notifications'
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1
                        }
                    }
                }
            };

            const response = await admin.messaging().send(message);
            console.log(`✅ Push notification sent: ${response}`);
            return { success: true, messageId: response };
        } catch (error) {
            console.error(`❌ Push notification error:`, error.message);

            // Handle invalid token - remove it from user
            if (error.code === 'messaging/invalid-registration-token' || 
                error.code === 'messaging/registration-token-not-registered') {
                // Remove invalid token from user
                await User.updateOne(
                    { fcmToken: fcmToken },
                    { $unset: { fcmToken: 1, fcmTokenUpdatedAt: 1 } }
                );
                return { success: false, error: 'Invalid token', shouldRetry: false };
            }

            // Retry logic
            if (retries > 0 && error.code !== 'messaging/invalid-registration-token') {
                console.log(`🔄 Retrying push notification (${retries} retries left)...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                return this.sendPushNotification(fcmToken, notification, retries - 1);
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * Send email notification
     * @param {String} email - Email address
     * @param {String} subject - Email subject
     * @param {String} htmlBody - HTML email body
     * @param {Number} retries - Number of retries remaining
     * @returns {Promise<Object>} - Result object
     */
    static async sendEmailNotification(email, subject, htmlBody, retries = 2) {
        try {
            await sendEmail({
                email: email,
                subject: subject,
                html: htmlBody
            });
            return { success: true };
        } catch (error) {
            console.error(`❌ Email send error to ${email}:`, error.message);
            
            // Retry logic
            if (retries > 0) {
                console.log(`🔄 Retrying email (${retries} retries left)...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                return this.sendEmailNotification(email, subject, htmlBody, retries - 1);
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * Get localized notification message
     * @param {String} type - Notification type
     * @param {Object} data - Data for message interpolation
     * @param {String} language - Language code ('en' or 'ar')
     * @returns {Object} - {title, body}
     */
    static getLocalizedMessage(type, data = {}, language = 'en') {
        const messages = {
            en: {
                appointment: {
                    title: 'Appointment Reminder',
                    body: data.message || `Your appointment with ${data.doctorName || 'your doctor'} is scheduled for ${data.date || 'soon'}.`
                },
                reminder: {
                    title: 'Medication Reminder',
                    body: data.message || `Time to take your medication: ${data.medication || 'medication'}.`
                },
                wallet: {
                    title: 'Wallet Update',
                    body: data.message || `Your wallet balance has been updated.`
                },
                system: {
                    title: 'System Notification',
                    body: data.message || 'You have a new system notification.'
                }
            },
            ar: {
                appointment: {
                    title: 'تذكير بالموعد',
                    body: data.message || `موعدك مع ${data.doctorName || 'طبيبك'} مجدول في ${data.date || 'قريباً'}.`
                },
                reminder: {
                    title: 'تذكير بالأدوية',
                    body: data.message || `حان الوقت لتناول دوائك: ${data.medication || 'الدواء'}.`
                },
                wallet: {
                    title: 'تحديث المحفظة',
                    body: data.message || `تم تحديث رصيد محفظتك.`
                },
                system: {
                    title: 'إشعار النظام',
                    body: data.message || 'لديك إشعار نظام جديد.'
                }
            }
        };

        const langMessages = messages[language] || messages.en;
        const typeMessages = langMessages[type] || langMessages.system;
        
        return {
            title: typeMessages.title,
            body: typeMessages.body
        };
    }

    /**
     * Sanitize notification data to remove sensitive information
     * @param {Object} data - Original data
     * @returns {Object} - Sanitized data
     */
    static sanitizeNotificationData(data) {
        const sanitized = { ...data };
        
        // Remove sensitive fields
        delete sanitized.password;
        delete sanitized.passwordResetOtp;
        delete sanitized.registrationOtp;
        delete sanitized.medicalProfile?.chronicConditions; // Keep medical profile but remove sensitive details
        delete sanitized.ssn;
        delete sanitized.nationalId;
        
        return sanitized;
    }

    /**
     * Send external notification to user
     * Respects user preferences and handles all channels
     * @param {String} userId - User ID
     * @param {String} type - Notification type ('appointment', 'reminder', 'wallet', 'system')
     * @param {Object} data - Notification data
     * @param {String} language - Language code ('en' or 'ar')
     * @returns {Promise<Object>} - Result object with delivery status
     */
    static async sendExternalNotification(userId, type, data = {}, language = 'en') {
        try {
            // Fetch user with preferences
            const user = await User.findById(userId);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Check if user is disabled
            if (user.isDisabled) {
                return { success: false, error: 'User account is disabled' };
            }

            // Check if user has preferences for this notification type
            const typePreference = user.notificationPreferences?.[type];
            if (typePreference === false) {
                return { success: false, error: 'User has disabled this notification type' };
            }

            // Get localized message
            const message = this.getLocalizedMessage(type, data, language);

            // Prefer explicit title/message coming from the in-app notification creator
            // (e.g. appointment confirmation) so external notifications match in-app content.
            const preferredTitle = (data && data.title) ? String(data.title) : String(message.title);
            const preferredBody = (data && data.message) ? String(data.message) : String(message.body);
            
            // Sanitize data
            const sanitizedData = this.sanitizeNotificationData(data);

            const results = {
                push: { success: false },
                email: { success: false },
                sms: { success: false }
            };

            // Send push notification if enabled and token exists
            if (user.notificationPreferences?.push && user.fcmToken) {
                results.push = await this.sendPushNotification(user.fcmToken, {
                    title: preferredTitle,
                    body: preferredBody,
                    data: {
                        type: type,
                        ...sanitizedData
                    }
                });
            }

            // Send email if enabled
            if (user.notificationPreferences?.email && user.email) {
                const emailSubject = preferredTitle;
                const emailBody = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #006FEE;">${preferredTitle}</h2>
                        <p>${preferredBody}</p>
                        ${data.link ? `<p><a href="${data.link}" style="color: #006FEE;">View Details</a></p>` : ''}
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="color: #666; font-size: 12px;">This is an automated notification from MyClinic.</p>
                    </div>
                `;
                results.email = await this.sendEmailNotification(user.email, emailSubject, emailBody);
            }

            // Send SMS if enabled and phone number exists
            if (user.notificationPreferences?.sms && user.phone) {
                // Format phone number for Twilio (E.164 format)
                let phoneNumber = user.phone;
                if (!phoneNumber.startsWith('+')) {
                    // Assume Libyan number format and add +218
                    phoneNumber = phoneNumber.replace(/^0/, '+218');
                }
                results.sms = await this.sendSMS(phoneNumber, preferredBody, language);
            }

            // Return overall success if at least one channel succeeded
            const overallSuccess = results.push.success || results.email.success || results.sms.success;
            
            return {
                success: overallSuccess,
                results: results,
                message: overallSuccess 
                    ? 'Notification sent via at least one channel' 
                    : 'Failed to send notification via any channel'
            };
        } catch (error) {
            console.error('External notification error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send batch notifications to multiple users
     * @param {Array<String>} userIds - Array of user IDs
     * @param {String} type - Notification type
     * @param {Object} data - Notification data
     * @param {String} language - Language code
     * @returns {Promise<Object>} - Batch result
     */
    static async sendBatchNotifications(userIds, type, data = {}, language = 'en') {
        const results = {
            total: userIds.length,
            successful: 0,
            failed: 0,
            details: []
        };

        for (const userId of userIds) {
            try {
                const result = await this.sendExternalNotification(userId, type, data, language);
                if (result.success) {
                    results.successful++;
                } else {
                    results.failed++;
                }
                results.details.push({ userId, ...result });
            } catch (error) {
                results.failed++;
                results.details.push({ userId, success: false, error: error.message });
            }
        }

        return results;
    }
}

// Initialize Firebase on module load
ExternalNotificationService.initializeFirebase();

module.exports = ExternalNotificationService;

