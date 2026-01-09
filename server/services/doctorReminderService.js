const Appointment = require('../models/appointment');
const User = require('../models/user');
const ExternalNotificationService = require('./externalNotificationService');
const moment = require('moment');

/**
 * Service for sending automated appointment reminders to doctors
 * Handles 24-hour and 1-hour reminders before appointments
 */
class DoctorReminderService {
    /**
     * Calculate appointment datetime from date and time strings
     * @param {String} date - Date string (YYYY-MM-DD)
     * @param {String} time - Time string (e.g., "2:30 PM" or "14:30")
     * @returns {moment.Moment} - Moment object representing appointment datetime
     */
    static parseAppointmentDateTime(date, time) {
        // Parse time - handle both 12-hour (2:30 PM) and 24-hour (14:30) formats
        let timeStr = time.trim();
        let hours, minutes;
        
        if (timeStr.includes('AM') || timeStr.includes('PM')) {
            // 12-hour format
            const [timePart, modifier] = timeStr.split(/\s*(AM|PM)/i);
            const [h, m] = timePart.split(':').map(Number);
            hours = h;
            minutes = m || 0;
            
            if (modifier.toUpperCase() === 'PM' && hours !== 12) {
                hours += 12;
            } else if (modifier.toUpperCase() === 'AM' && hours === 12) {
                hours = 0;
            }
        } else {
            // 24-hour format
            const [h, m] = timeStr.split(':').map(Number);
            hours = h;
            minutes = m || 0;
        }
        
        // Combine date and time
        const dateTimeStr = `${date} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        return moment(dateTimeStr, 'YYYY-MM-DD HH:mm');
    }

    /**
     * Send reminder notification to doctor
     * @param {Object} appointment - Appointment document
     * @param {String} reminderType - '24h' or '1h'
     * @param {String} language - Language code ('en' or 'ar')
     * @returns {Promise<Object>} - Result object
     */
    static async sendDoctorReminder(appointment, reminderType, language = 'en') {
        try {
            // Populate appointment if needed
            if (!appointment.doctor || typeof appointment.doctor === 'string') {
                appointment = await Appointment.findById(appointment._id)
                    .populate('doctor', 'name email notificationPreferences doctorReminderPreferences isDisabled isActive')
                    .populate('user', 'name')
                    .populate('appointmentType', 'name')
                    .populate('hospital', 'name');
            }

            const doctor = appointment.doctor;
            const patient = appointment.user;
            const appointmentType = appointment.appointmentType;
            const hospital = appointment.hospital;

            // Validate doctor
            if (!doctor || doctor.isDisabled || !doctor.isActive) {
                return {
                    success: false,
                    error: 'Doctor account is disabled or inactive',
                    appointmentId: appointment._id.toString()
                };
            }

            // Check doctor reminder preferences
            const preferences = doctor.doctorReminderPreferences || {};
            if (!preferences.enabled) {
                return {
                    success: false,
                    error: 'Doctor has disabled appointment reminders',
                    appointmentId: appointment._id.toString()
                };
            }

            // Check specific reminder type preference
            if (reminderType === '24h' && !preferences.reminder24h) {
                return {
                    success: false,
                    error: 'Doctor has disabled 24-hour reminders',
                    appointmentId: appointment._id.toString()
                };
            }

            if (reminderType === '1h' && !preferences.reminder1h) {
                return {
                    success: false,
                    error: 'Doctor has disabled 1-hour reminders',
                    appointmentId: appointment._id.toString()
                };
            }

            // Get patient name (handle I18nString)
            const patientName = patient.name?.en || patient.name?.ar || patient.name || 'Patient';
            
            // Get appointment type name (handle I18nString)
            const appointmentTypeName = appointmentType?.name?.en || appointmentType?.name?.ar || appointmentType?.name || 'Consultation';
            
            // Get hospital name (handle I18nString)
            const hospitalName = hospital?.name?.en || hospital?.name?.ar || hospital?.name || 'Hospital';

            // Format appointment datetime
            const appointmentDateTime = this.parseAppointmentDateTime(appointment.date, appointment.time);
            const formattedDate = appointmentDateTime.format('MMMM Do, YYYY');
            const formattedTime = appointmentDateTime.format('h:mm A');

            // Create localized message
            const messages = {
                en: {
                    title24h: 'Appointment Reminder - 24 Hours',
                    title1h: 'Appointment Reminder - 1 Hour',
                    body24h: `You have an appointment with ${patientName} tomorrow at ${formattedTime} for ${appointmentTypeName} at ${hospitalName}.`,
                    body1h: `You have an appointment with ${patientName} in 1 hour (${formattedTime}) for ${appointmentTypeName} at ${hospitalName}.`
                },
                ar: {
                    title24h: 'تذكير بالموعد - 24 ساعة',
                    title1h: 'تذكير بالموعد - ساعة واحدة',
                    body24h: `لديك موعد مع ${patientName} غداً في ${formattedTime} لـ ${appointmentTypeName} في ${hospitalName}.`,
                    body1h: `لديك موعد مع ${patientName} خلال ساعة واحدة (${formattedTime}) لـ ${appointmentTypeName} في ${hospitalName}.`
                }
            };

            const langMessages = messages[language] || messages.en;
            const title = reminderType === '24h' ? langMessages.title24h : langMessages.title1h;
            const body = reminderType === '24h' ? langMessages.body24h : langMessages.body1h;

            // Send external notification
            const notificationResult = await ExternalNotificationService.sendExternalNotification(
                doctor._id.toString(),
                'reminder',
                {
                    message: body,
                    patientName: patientName,
                    appointmentDate: formattedDate,
                    appointmentTime: formattedTime,
                    appointmentType: appointmentTypeName,
                    hospitalName: hospitalName,
                    reminderType: reminderType,
                    link: '#/appointments'
                },
                language
            );

            // Update appointment tracking
            if (notificationResult.success) {
                const updateField = reminderType === '24h' ? 'doctorReminder24hSent' : 'doctorReminder1hSent';
                const updateTimeField = reminderType === '24h' ? 'doctorReminder24hSentAt' : 'doctorReminder1hSentAt';
                
                await Appointment.findByIdAndUpdate(appointment._id, {
                    [updateField]: true,
                    [updateTimeField]: new Date()
                });

                // Log success
                console.log(`✅ Doctor reminder sent: ${reminderType} reminder for appointment ${appointment._id} to doctor ${doctor._id}`);
            }

            return {
                success: notificationResult.success,
                appointmentId: appointment._id.toString(),
                doctorId: doctor._id.toString(),
                reminderType: reminderType,
                notificationResult: notificationResult
            };
        } catch (error) {
            console.error(`❌ Error sending doctor reminder for appointment ${appointment._id}:`, error);
            return {
                success: false,
                error: error.message,
                appointmentId: appointment._id?.toString() || 'unknown'
            };
        }
    }

    /**
     * Process appointments that need 24-hour reminders
     * @returns {Promise<Object>} - Processing results
     */
    static async process24HourReminders() {
        const now = moment();
        const targetTime = now.clone().add(24, 'hours');
        
        // Find appointments that:
        // 1. Are in status 'Upcoming'
        // 2. Are approximately 24 hours away (within a 1-hour window)
        // 3. Haven't had 24h reminder sent yet
        // 4. Are not canceled
        
        const startWindow = targetTime.clone().subtract(30, 'minutes');
        const endWindow = targetTime.clone().add(30, 'minutes');

        try {
            const appointments = await Appointment.find({
                status: 'Upcoming',
                doctorReminder24hSent: false
            })
            .populate('doctor', 'name email notificationPreferences doctorReminderPreferences isDisabled isActive')
            .populate('user', 'name')
            .populate('appointmentType', 'name')
            .populate('hospital', 'name');

            const results = {
                total: appointments.length,
                processed: 0,
                sent: 0,
                failed: 0,
                skipped: 0,
                details: []
            };

            for (const appointment of appointments) {
                try {
                    const appointmentDateTime = this.parseAppointmentDateTime(appointment.date, appointment.time);
                    
                    // Check if appointment is within the 24-hour window
                    if (!appointmentDateTime.isBetween(startWindow, endWindow, null, '[]')) {
                        results.skipped++;
                        continue;
                    }

                    // Check if appointment is in the future
                    if (appointmentDateTime.isBefore(now)) {
                        results.skipped++;
                        continue;
                    }

                    // Determine language (default to 'en', could be enhanced to get from doctor preferences)
                    const language = 'en'; // TODO: Get from doctor preferences or system settings

                    const result = await this.sendDoctorReminder(appointment, '24h', language);
                    results.processed++;

                    if (result.success) {
                        results.sent++;
                    } else {
                        results.failed++;
                    }

                    results.details.push(result);
                } catch (error) {
                    results.failed++;
                    results.details.push({
                        success: false,
                        error: error.message,
                        appointmentId: appointment._id.toString()
                    });
                }
            }

            // Log summary
            console.log(`📅 24h Reminder Processing: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped out of ${results.total} appointments`);

            return results;
        } catch (error) {
            console.error('❌ Error processing 24-hour reminders:', error);
            throw error;
        }
    }

    /**
     * Process appointments that need 1-hour reminders
     * @returns {Promise<Object>} - Processing results
     */
    static async process1HourReminders() {
        const now = moment();
        const targetTime = now.clone().add(1, 'hour');
        
        // Find appointments that:
        // 1. Are in status 'Upcoming'
        // 2. Are approximately 1 hour away (within a 15-minute window)
        // 3. Haven't had 1h reminder sent yet
        // 4. Are not canceled

        const startWindow = targetTime.clone().subtract(7, 'minutes');
        const endWindow = targetTime.clone().add(7, 'minutes');

        try {
            const appointments = await Appointment.find({
                status: 'Upcoming',
                doctorReminder1hSent: false
            })
            .populate('doctor', 'name notificationPreferences doctorReminderPreferences isDisabled isActive')
            .populate('user', 'name')
            .populate('appointmentType', 'name')
            .populate('hospital', 'name');

            const results = {
                total: appointments.length,
                processed: 0,
                sent: 0,
                failed: 0,
                skipped: 0,
                details: []
            };

            for (const appointment of appointments) {
                try {
                    const appointmentDateTime = this.parseAppointmentDateTime(appointment.date, appointment.time);
                    
                    // Check if appointment is within the 1-hour window
                    if (!appointmentDateTime.isBetween(startWindow, endWindow, null, '[]')) {
                        results.skipped++;
                        continue;
                    }

                    // Check if appointment is in the future
                    if (appointmentDateTime.isBefore(now)) {
                        results.skipped++;
                        continue;
                    }

                    // Determine language
                    const language = 'en'; // TODO: Get from doctor preferences

                    const result = await this.sendDoctorReminder(appointment, '1h', language);
                    results.processed++;

                    if (result.success) {
                        results.sent++;
                    } else {
                        results.failed++;
                    }

                    results.details.push(result);
                } catch (error) {
                    results.failed++;
                    results.details.push({
                        success: false,
                        error: error.message,
                        appointmentId: appointment._id.toString()
                    });
                }
            }

            // Log summary
            console.log(`⏰ 1h Reminder Processing: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped out of ${results.total} appointments`);

            return results;
        } catch (error) {
            console.error('❌ Error processing 1-hour reminders:', error);
            throw error;
        }
    }

    /**
     * Process all pending reminders (both 24h and 1h)
     * @returns {Promise<Object>} - Combined results
     */
    static async processAllReminders() {
        const startTime = Date.now();
        
        try {
            const [results24h, results1h] = await Promise.all([
                this.process24HourReminders(),
                this.process1HourReminders()
            ]);

            const totalTime = Date.now() - startTime;

            const summary = {
                timestamp: new Date().toISOString(),
                processingTime: `${totalTime}ms`,
                reminders24h: results24h,
                reminders1h: results1h,
                totalSent: results24h.sent + results1h.sent,
                totalFailed: results24h.failed + results1h.failed
            };

            console.log(`📊 Reminder Processing Summary: ${summary.totalSent} sent, ${summary.totalFailed} failed in ${totalTime}ms`);

            return summary;
        } catch (error) {
            console.error('❌ Error processing all reminders:', error);
            throw error;
        }
    }
}

module.exports = DoctorReminderService;

