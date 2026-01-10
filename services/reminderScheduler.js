// Optional node-cron - only load if available
let cron = null;
try {
    cron = require('node-cron');
} catch (error) {
    console.warn('⚠️ node-cron not installed. Reminder scheduler will be disabled.');
}

const DoctorReminderService = require('./doctorReminderService');

/**
 * Scheduler service for automated doctor appointment reminders
 * Runs periodic checks for appointments needing reminders
 */
class ReminderScheduler {
    static isRunning = false;
    static cronJobs = [];

    /**
     * Start the reminder scheduler
     */
    static start() {
        if (this.isRunning) {
            console.warn('⚠️ Reminder scheduler is already running');
            return;
        }

        // Check if node-cron is available
        if (!cron) {
            console.warn('⚠️ node-cron not installed. Reminder scheduler will not start.');
            console.warn('   Run: npm install node-cron');
            return;
        }

        console.log('🚀 Starting Doctor Reminder Scheduler...');

        // Run every 15 minutes to check for reminders
        // This ensures we catch appointments within the reminder windows
        const reminderJob = cron.schedule('*/15 * * * *', async () => {
            try {
                console.log(`⏰ Running reminder check at ${new Date().toISOString()}`);
                await DoctorReminderService.processAllReminders();
            } catch (error) {
                console.error('❌ Error in scheduled reminder check:', error);
            }
        }, {
            scheduled: true,
            timezone: 'UTC' // Adjust timezone as needed
        });

        this.cronJobs.push(reminderJob);
        this.isRunning = true;

        console.log('✅ Reminder scheduler started (runs every 15 minutes)');
    }

    /**
     * Stop the reminder scheduler
     */
    static stop() {
        if (!this.isRunning) {
            console.warn('⚠️ Reminder scheduler is not running');
            return;
        }

        this.cronJobs.forEach(job => job.stop());
        this.cronJobs = [];
        this.isRunning = false;

        console.log('🛑 Reminder scheduler stopped');
    }

    /**
     * Manually trigger reminder processing (for testing/admin)
     */
    static async triggerNow() {
        console.log('🔔 Manually triggering reminder processing...');
        try {
            const results = await DoctorReminderService.processAllReminders();
            return results;
        } catch (error) {
            console.error('❌ Error in manual reminder trigger:', error);
            throw error;
        }
    }
}

module.exports = ReminderScheduler;

