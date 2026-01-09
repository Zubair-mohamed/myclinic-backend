
const mongoose = require('mongoose');
const Notification = require('../models/notification');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/myClinicDB';

const translationMap = {
    'Appointment Confirmed': 'تم تأكيد الموعد',
    'Appointment Reminder': 'تذكير بالموعد',
    'Wallet Credited': 'تم شحن المحفظة',
    'Next in Line': 'دورك القادم',
    'System Notification': 'إشعار من النظام',
    'Notification': 'إشعار',
    'Emergency Alert': 'تنبيه طارئ',
    'Quick Notification': 'إشعار سريع',
    'Heads up!': 'تنبيه!',
    'Reminder:': 'تذكير:',
    'Your appointment': 'موعدك',
    'is confirmed': 'تم تأكيده',
    'with Dr.': 'مع د.',
    'at': 'في',
    'on': 'بتاريخ',
    'tomorrow': 'غداً',
    'in 1 hour': 'خلال ساعة',
    'in 1 day': 'خلال يوم',
    'in 2 days': 'خلال يومين',
    'soon': 'قريباً',
    'Your wallet has been credited with': 'تم إيداع مبلغ',
    'LYD.': 'دينار في محفظتك.',
    'You are next in line for': 'أنت التالي في الدور لـ',
    'Please be ready.': 'يرجى الاستعداد.',
    'Consultation': 'استشارة',
    'Checkup': 'فحص',
    'Follow-up': 'مراجعة',
    'X-Ray': 'صورة أشعة',
    'Surgery': 'عملية جراحية'
};

function translateText(text) {
    if (!text || typeof text !== 'string') return text;
    
    let translated = text;
    
    // Check for exact matches first
    if (translationMap[text]) return translationMap[text];
    
    // Pattern based translation
    if (text.includes('Your appointment for a') && text.includes('is confirmed')) {
        translated = text
            .replace('Your appointment for a', 'تم تأكيد موعدك لـ')
            .replace('with', 'مع')
            .replace('on', 'في')
            .replace('is confirmed.', '');
    } else if (text.includes('Reminder: Your appointment with Dr.')) {
        translated = text
            .replace('Reminder: Your appointment with Dr.', 'تذكير: موعدك مع د.')
            .replace('is', 'هو')
            .replace('in 1 hour', 'خلال ساعة')
            .replace('in 1 day', 'خلال يوم')
            .replace('in 2 days', 'خلال يومين')
            .replace('soon', 'قريباً');
    } else if (text.includes('Your wallet has been credited with')) {
        translated = text
            .replace('Your wallet has been credited with', 'تم إيداع')
            .replace('LYD.', 'دينار في محفظتك.');
    } else if (text.includes('Heads up! You are next in line for Dr.')) {
        translated = text
            .replace('Heads up! You are next in line for Dr.', 'تنبيه! أنت التالي في الدور لـ د.')
            .replace('Please be ready.', 'يرجى الاستعداد.');
    } else if (text.includes('You have an appointment with')) {
        translated = text
            .replace('You have an appointment with', 'لديك موعد مع')
            .replace('tomorrow', 'غداً')
            .replace('in 1 hour', 'خلال ساعة')
            .replace('for', 'لـ')
            .replace('at', 'في');
    }

    // Final cleanup: if it still contains English letters, it might be a name or something we didn't catch
    // But we've done our best.
    return translated;
}

async function migrate() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB for final migration...');

        const notifications = await Notification.find({});
        console.log(`Processing ${notifications.length} notifications...`);

        let updatedCount = 0;

        for (const notif of notifications) {
            let updated = false;
            
            // Handle Message
            if (typeof notif.message === 'string') {
                notif.message = {
                    en: notif.message,
                    ar: translateText(notif.message)
                };
                updated = true;
            } else if (notif.message && typeof notif.message === 'object') {
                if (!notif.message.ar || notif.message.ar === notif.message.en) {
                    notif.message.ar = translateText(notif.message.en);
                    notif.markModified('message');
                    updated = true;
                }
            }

            // Handle Title
            if (typeof notif.title === 'string') {
                notif.title = {
                    en: notif.title,
                    ar: translateText(notif.title)
                };
                updated = true;
            } else if (notif.title && typeof notif.title === 'object') {
                if (!notif.title.ar || notif.title.ar === notif.title.en) {
                    notif.title.ar = translateText(notif.title.en);
                    notif.markModified('title');
                    updated = true;
                }
            } else if (!notif.title) {
                notif.title = {
                    en: 'Notification',
                    ar: 'إشعار'
                };
                updated = true;
            }

            if (updated) {
                await notif.save();
                updatedCount++;
            }
        }

        console.log(`Final migration completed. Updated ${updatedCount} notifications.`);
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
