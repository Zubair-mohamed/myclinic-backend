const Notification = require('../models/notification');
const ExternalNotificationService = require('../services/externalNotificationService');

/**
 * Helper function to create both in-app and external notifications
 * @param {String} userId - User ID
 * @param {String} type - Notification type ('appointment', 'reminder', 'wallet', 'system')
 * @param {String} message - Notification message
 * @param {Object} options - Additional options
 * @param {String} options.language - Language code ('en' or 'ar')
 * @param {Object} options.data - Additional data for external notifications
 * @param {Object} options.session - MongoDB session for transactions
 * @returns {Promise<Object>} - Result object
 */
async function createNotification(userId, type, message, options = {}) {
    const { title, language = 'en', data = {}, session = null } = options;
    
    try {
        // Create in-app notification
        const notificationData = {
            user: userId,
            type: type,
            title: title,
            message: message,
            isRead: false
        };

        let inAppNotification;
        if (session) {
            inAppNotification = await Notification.create([notificationData], { session });
        } else {
            inAppNotification = await Notification.create([notificationData]);
        }

        // Determine message for external notification
        let externalMessage = message;
        if (typeof message === 'object' && message !== null) {
            externalMessage = message[language] || message.en || message.ar || '';
        }

        let externalTitle = title;
        if (typeof title === 'object' && title !== null) {
            externalTitle = title[language] || title.en || title.ar || '';
        }

        // Send external notification (non-blocking)
        // Don't await to avoid blocking the main flow
        ExternalNotificationService.sendExternalNotification(
            userId,
            type,
            {
                title: externalTitle,
                message: externalMessage,
                ...data
            },
            language
        ).catch(error => {
            console.error(`External notification failed for user ${userId}:`, error.message);
            // Don't throw - external notification failure shouldn't break the flow
        });

        return {
            success: true,
            inAppNotification: inAppNotification[0] || inAppNotification,
            externalNotificationSent: true
        };
    } catch (error) {
        console.error('Notification creation error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = { createNotification };

