
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');
const Appointment = require('./models/appointment');
const Medication = require('./models/medication');
const Transaction = require('./models/transaction');
const Reminder = require('./models/reminder');
const Notification = require('./models/notification');
const Hospital = require('./models/hospital');
const EmergencyContact = require('./models/emergencyContact');
const RedeemCode = require('./models/redeemCode');
const Specialty = require('./models/specialty');
const AppointmentType = require('./models/appointmentType');
const QueueItem = require('./models/queueItem');
const Wallet = require('./models/wallet');
const MedicalReport = require('./models/medicalReport');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/myClinicDB';

// --- CONSTANTS & DATA ---

const hospitalsData = [
    {
        name: { en: 'Tripoli University Hospital', ar: 'مستشفى طرابلس الجامعي' },
        address: 'Elfrnaj, Tripoli, Libya',
        city: 'Tripoli',
        phone: '+218 21 462 3101',
        email: 'info@tuh.edu.ly',
        description: {
            ar: 'مستشفى طرابلس الجامعي هو أكبر مستشفى تعليمي في ليبيا، يقدم خدمات طبية متكاملة وتدريب للكوادر الطبية بأعلى المعايير.',
            en: 'Tripoli University Hospital is the largest teaching hospital in Libya, providing integrated medical services and training for medical staff with the highest standards.'
        },
        refundPolicyPercentage: 80,
        latitude: 32.853405150927976,
        longitude: 13.229569432963745
    },
    {
        name: { en: 'Benghazi Medical Center', ar: 'مركز بنغازي الطبي' },
        address: 'Hawari Road, Benghazi, Libya',
        city: 'Benghazi',
        phone: '+218 61 222 0222',
        email: 'info@bmc.ly',
        description: {
            ar: 'مركز بنغازي الطبي هو المرفق الصحي الرئيسي في شرق ليبيا، يضم نخبة من الاستشاريين ويقدم خدمات تخصصية متقدمة.',
            en: 'Benghazi Medical Center is the primary health facility in eastern Libya, featuring elite consultants and providing advanced specialized services.'
        },
        refundPolicyPercentage: 90,
        latitude: 32.07768,
        longitude: 20.09815
    },
    {
        name: { en: 'Misrata Central Hospital', ar: 'مستشفى مصراتة المركزي' },
        address: 'Tripoli Street, Misrata, Libya',
        city: 'Misrata',
        phone: '+218 51 261 0000',
        email: 'info@mch.ly',
        description: {
            ar: 'مستشفى مصراتة المركزي هو صرح طبي متكامل يخدم المنطقة الوسطى، مجهز بأحدث التقنيات الطبية وغرف العمليات.',
            en: 'Misrata Central Hospital is an integrated medical landmark serving the central region, equipped with the latest medical technologies and operating rooms.'
        },
        refundPolicyPercentage: 85,
        latitude: 32.360789,
        longitude: 15.075104
    },
    {
        name: { en: 'Al-Khadra Hospital', ar: 'مستشفى الخضراء' },
        address: 'Al-Hadba Al-Khadra, Tripoli, Libya',
        city: 'Tripoli',
        phone: '+218 21 490 0000',
        email: 'info@khadra.ly',
        description: {
            ar: 'مستشفى الخضراء العام يقدم خدمات طبية متنوعة لسكان طرابلس، ويشتهر بأقسام الجراحة والباطنة المتميزة.',
            en: 'Al-Khadra General Hospital provides diverse medical services to Tripoli residents, known for its excellent surgery and internal medicine departments.'
        },
        refundPolicyPercentage: 75,
        latitude: 32.85485,
        longitude: 13.19244
    }
];

const specialtiesList = [
    { en: 'Cardiology', ar: 'القلب' },
    { en: 'Dermatology', ar: 'الجلدية' },
    { en: 'Pediatrics', ar: 'الأطفال' },
    { en: 'Orthopedics', ar: 'جراحة العظام' },
    { en: 'Otolaryngology (ENT)', ar: 'أنف وأذن وحنجرة' },
    { en: 'General Surgery', ar: 'الجراحة العامة' },
    { en: 'Internal Medicine', ar: 'الباطني' },
    { en: 'Ophthalmology', ar: 'العيون' },
    { en: 'Obstetrics and Gynecology', ar: 'النساء والولادة' },
    { en: 'Dentistry', ar: 'الأسنان' }
];

// The 4 Standard Services required for EVERY specialty
const standardServices = [
    {
        name: { en: 'Checkup', ar: 'فحص' },
        duration: 20,
        cost: 50
    },
    {
        name: { en: 'Follow-up (1 week max)', ar: 'مراجعة (خلال أسبوع كحد أقصى)' },
        duration: 15,
        cost: 25
    },
    {
        name: { en: 'X-Ray', ar: 'صورة أشعة' },
        duration: 30,
        cost: 100
    },
    {
        name: { en: 'Surgery', ar: 'عملية جراحية' },
        duration: 120,
        cost: 1500
    }
];

const doctorsData = [
    // Tripoli University Hospital
    {
        name: { en: 'Dr. Khaled El-Mahdi', ar: 'د. خالد المهدي' },
        email: 'khaled.m@clinic.ly',
        specialty: 'Cardiology',
        gender: 'Male',
        hospitalIndices: [0],
        bio: { en: 'Expert cardiologist with 15 years of experience in heart surgery.', ar: 'خبير في القلب مع 15 عامًا من الخبرة في جراحة القلب.' }
    },
    {
        name: { en: 'Dr. Sarah Ben Amer', ar: 'د. سارة بن عامر' },
        email: 'sarah.b@clinic.ly',
        specialty: 'Pediatrics',
        gender: 'Female',
        hospitalIndices: [0],
        bio: { en: 'Compassionate pediatrician dedicated to child health and development.', ar: 'أخصائية أطفال حنونة متفانية في صحة الطفل وتنميته.' }
    },
    {
        name: { en: 'Dr. Omar Al-Werfalli', ar: 'د. عمر الورفلي' },
        email: 'omar.w@clinic.ly',
        specialty: 'General Surgery',
        gender: 'Male',
        hospitalIndices: [0],
        bio: { en: 'Specialist in minimally invasive general surgery.', ar: 'أخصائي في الجراحة العامة بأقل قدر من التدخل الجراحي.' }
    },
    {
        name: { en: 'Dr. Fatima Zawi', ar: 'د. فاطمة الزاوي' },
        email: 'fatima.z@clinic.ly',
        specialty: 'Dermatology',
        gender: 'Female',
        hospitalIndices: [0],
        bio: { en: 'Expert in clinical and cosmetic dermatology.', ar: 'خبيرة في الجلدية التجميلية والسريرية.' }
    },

    // Benghazi Medical Center
    {
        name: { en: 'Dr. Ali Al-Faitouri', ar: 'د. علي الفيتوري' },
        email: 'ali.f@clinic.ly',
        specialty: 'Orthopedics',
        gender: 'Male',
        hospitalIndices: [1],
        bio: { en: 'Specialist in orthopedic surgery and sports medicine.', ar: 'أخصائي في جراحة العظام والطب الرياضي.' }
    },
    {
        name: { en: 'Dr. Huda Al-Mugaryef', ar: 'د. هدى المقريف' },
        email: 'huda.m@clinic.ly',
        specialty: 'Internal Medicine',
        gender: 'Female',
        hospitalIndices: [1],
        bio: { en: 'Expert in managing chronic diseases and internal medicine.', ar: 'خبيرة في إدارة الأمراض المزمنة والباطني.' }
    },
    {
        name: { en: 'Dr. Ibrahim Shamis', ar: 'د. إبراهيم شمس' },
        email: 'ibrahim.s@clinic.ly',
        specialty: 'Cardiology',
        gender: 'Male',
        hospitalIndices: [1],
        bio: { en: 'Cardiologist focused on preventive heart care.', ar: 'طبيب قلب يركز على رعاية القلب الوقائية.' }
    },
    {
        name: { en: 'Dr. Salma Bujwari', ar: 'د. سلمى بوجواري' },
        email: 'salma.b@clinic.ly',
        specialty: 'Obstetrics and Gynecology',
        gender: 'Female',
        hospitalIndices: [1],
        bio: { en: 'Specialist in maternal-fetal medicine and women health.', ar: 'أخصائية في طب الأم والجنين وصحة المرأة.' }
    },

    // Misrata Central
    {
        name: { en: 'Dr. Mohamed Swehli', ar: 'د. محمد السويحلي' },
        email: 'mohamed.s@clinic.ly',
        specialty: 'Otolaryngology (ENT)',
        gender: 'Male',
        hospitalIndices: [2],
        bio: { en: 'ENT specialist focused on pediatric and adult ear, nose, and throat issues.', ar: 'أخصائي أنف وأذن وحنجرة يركز على مشاكل الأنف والأذن والحنجرة للأطفال والكبار.' }
    },
    {
        name: { en: 'Dr. Aisha Qalib', ar: 'د. عائشة قليب' },
        email: 'aisha.q@clinic.ly',
        specialty: 'Pediatrics',
        gender: 'Female',
        hospitalIndices: [2],
        bio: { en: 'Dedicated pediatrician with expertise in infant care.', ar: 'أخصائية أطفال مخلصة وخبيرة في رعاية الرضع.' }
    },
    {
        name: { en: 'Dr. Yousef Al-Mangoush', ar: 'د. يوسف المنقوش' },
        email: 'yousef.m@clinic.ly',
        specialty: 'General Surgery',
        gender: 'Male',
        hospitalIndices: [2],
        bio: { en: 'General surgeon with specialization in laparoscopy.', ar: 'جراح عام متخصص في المنظار.' }
    },

    // Al-Khadra (Tripoli) & Shared with University
    {
        name: { en: 'Dr. Nuri Belhaj', ar: 'د. نوري بلحاج' },
        email: 'nuri.b@clinic.ly',
        specialty: 'Ophthalmology',
        gender: 'Male',
        hospitalIndices: [3],
        bio: { en: 'Specialist in refractive surgery and corneal diseases.', ar: 'أخصائي في الجراحة الانكسارية والعيون.' }
    },
    {
        name: { en: 'Dr. Layla Aboud', ar: 'د. ليلى عبود' },
        email: 'layla.a@clinic.ly',
        specialty: 'Dentistry',
        gender: 'Female',
        hospitalIndices: [3],
        bio: { en: 'Expert in restorative dentistry and oral health.', ar: 'خبيرة في طب الأسنان الترميمي وصحة الفم.' }
    },
    {
        name: { en: 'Dr. Tarek Al-Ghzwi', ar: 'د. طارق الغزوي' },
        email: 'tarek.g@clinic.ly',
        specialty: 'Orthopedics',
        gender: 'Male',
        hospitalIndices: [0, 3],
        bio: { en: 'Orthopedic surgeon shared between Tripoli University and Al-Khadra hospitals.', ar: 'جراح عظام يعمل بين مستشفى طرابلس الجامعي ومستشفى الخضراء.' }
    },
    {
        name: { en: 'Dr. Muna Al-Fitouri', ar: 'د. منى الفيتوري' },
        email: 'muna.f@clinic.ly',
        specialty: 'Cardiology',
        gender: 'Female',
        hospitalIndices: [2],
        bio: { en: 'Specialist in clinical cardiology and heart failure.', ar: 'أخصائية في أمراض القلب السريرية وفشل القلب.' }
    },
    {
        name: { en: 'Dr. Ahmed Al-Zawi', ar: 'د. أحمد الزاوي' },
        email: 'ahmed.z@clinic.ly',
        specialty: 'Dermatology',
        gender: 'Male',
        hospitalIndices: [1],
        bio: { en: 'Expert in skin diseases and laser therapy.', ar: 'خبير في الأمراض الجلدية والعلاج بالليزر.' }
    },
    {
        name: { en: 'Dr. Laila Al-Werfalli', ar: 'د. ليلى الورفلي' },
        email: 'laila.w@clinic.ly',
        specialty: 'Internal Medicine',
        gender: 'Female',
        hospitalIndices: [0],
        bio: { en: 'Specialist in internal medicine and endocrinology.', ar: 'أخصائية في الباطني والغدد الصماء.' }
    },
    {
        name: { en: 'Dr. Sami Al-Mahdi', ar: 'د. سامي المهدي' },
        email: 'sami.m@clinic.ly',
        specialty: 'Pediatrics',
        gender: 'Male',
        hospitalIndices: [3],
        bio: { en: 'Pediatrician with focus on neonatal care.', ar: 'طبيب أطفال مع التركيز على رعاية حديثي الولادة.' }
    },
    {
        name: { en: 'Dr. Hana Al-Sayed', ar: 'د. هناء السيد' },
        email: 'hana.s@clinic.ly',
        specialty: 'Ophthalmology',
        gender: 'Female',
        hospitalIndices: [1],
        bio: { en: 'Expert in pediatric ophthalmology and strabismus.', ar: 'خبيرة في عيون الأطفال والحول.' }
    },
    {
        name: { en: 'Dr. Mustafa Al-Barasi', ar: 'د. مصطفى البراصي' },
        email: 'mustafa.b@clinic.ly',
        specialty: 'Dentistry',
        gender: 'Male',
        hospitalIndices: [2],
        bio: { en: 'Specialist in oral surgery and dental implants.', ar: 'أخصائي في جراحة الفم وزراعة الأسنان.' }
    },
    {
        name: { en: 'Dr. Reem Al-Qalib', ar: 'د. ريم قليب' },
        email: 'reem.q@clinic.ly',
        specialty: 'Otolaryngology (ENT)',
        gender: 'Female',
        hospitalIndices: [0],
        bio: { en: 'ENT specialist focused on sinus surgery.', ar: 'أخصائية أنف وأذن وحنجرة تركز على جراحة الجيوب الأنفية.' }
    },
    {
        name: { en: 'Dr. Adel Al-Mangoush', ar: 'د. عادل المنقوش' },
        email: 'adel.m@clinic.ly',
        specialty: 'General Surgery',
        gender: 'Male',
        hospitalIndices: [3],
        bio: { en: 'General surgeon with expertise in trauma surgery.', ar: 'جراح عام مع خبرة في جراحة الحوادث.' }
    },
    {
        name: { en: 'Dr. Nadia Al-Aboud', ar: 'د. نادية عبود' },
        email: 'nadia.a@clinic.ly',
        specialty: 'Orthopedics',
        gender: 'Female',
        hospitalIndices: [2],
        bio: { en: 'Specialist in joint replacement and orthopedic trauma.', ar: 'أخصائية في استبدال المفاصل وإصابات العظام.' }
    },
    {
        name: { en: 'Dr. Kamal Al-Ghzwi', ar: 'د. كمال الغزوي' },
        email: 'kamal.g@clinic.ly',
        specialty: 'Obstetrics and Gynecology',
        gender: 'Male',
        hospitalIndices: [0],
        bio: { en: 'Specialist in high-risk obstetrics and gynecology.', ar: 'أخصائي في النساء والولادة عالية الخطورة.' }
    },
    {
        name: { en: 'Dr. Zainab Al-Fassi', ar: 'د. زينب الفاسي' },
        email: 'zainab.f@clinic.ly',
        specialty: 'Obstetrics and Gynecology',
        gender: 'Female',
        hospitalIndices: [0],
        bio: { en: 'Expert in maternal health and natural birth.', ar: 'خبيرة في صحة الأم والولادة الطبيعية.' }
    },
    {
        name: { en: 'Dr. Maryam Al-Misrati', ar: 'د. مريم المصراتي' },
        email: 'maryam.m@clinic.ly',
        specialty: 'Obstetrics and Gynecology',
        gender: 'Female',
        hospitalIndices: [2],
        bio: { en: 'Specialist in gynecology and reproductive health.', ar: 'أخصائية في أمراض النساء والصحة الإنجابية.' }
    },
    {
        name: { en: 'Dr. Khadija Al-Warfalli', ar: 'د. خديجة الورفلي' },
        email: 'khadija.w@clinic.ly',
        specialty: 'Obstetrics and Gynecology',
        gender: 'Female',
        hospitalIndices: [3],
        bio: { en: 'Consultant in obstetrics and gynecological surgery.', ar: 'استشارية في الولادة وجراحة أمراض النساء.' }
    },
    // --- Additional Doctors to fill all specialties in all hospitals ---
    {
        name: { en: 'Dr. Ibrahim Al-Faitouri', ar: 'د. إبراهيم الفيتوري' },
        email: 'ibrahim.f@clinic.ly',
        specialty: 'Cardiology',
        gender: 'Male',
        hospitalIndices: [3],
        bio: { en: 'Cardiologist with expertise in heart rhythm disorders.', ar: 'طبيب قلب خبير في اضطرابات نظم القلب.' }
    },
    {
        name: { en: 'Dr. Salma Al-Zawi', ar: 'د. سلمى الزاوي' },
        email: 'salma.z@clinic.ly',
        specialty: 'Dermatology',
        gender: 'Female',
        hospitalIndices: [2, 3],
        bio: { en: 'Specialist in pediatric dermatology.', ar: 'أخصائية في أمراض الجلدية للأطفال.' }
    },
    {
        name: { en: 'Dr. Omar Al-Mahdi', ar: 'د. عمر المهدي' },
        email: 'omar.m@clinic.ly',
        specialty: 'Pediatrics',
        gender: 'Male',
        hospitalIndices: [1],
        bio: { en: 'Pediatrician focused on child nutrition.', ar: 'طبيب أطفال يركز على تغذية الطفل.' }
    },
    {
        name: { en: 'Dr. Fatima Al-Werfalli', ar: 'د. فاطمة الورفلي' },
        email: 'fatima.w@clinic.ly',
        specialty: 'Orthopedics',
        gender: 'Female',
        hospitalIndices: [0, 3],
        bio: { en: 'Specialist in hand and upper limb surgery.', ar: 'أخصائية في جراحة اليد والأطراف العلوية.' }
    },
    {
        name: { en: 'Dr. Ali Al-Sayed', ar: 'د. علي السيد' },
        email: 'ali.s@clinic.ly',
        specialty: 'Otolaryngology (ENT)',
        gender: 'Male',
        hospitalIndices: [1, 3],
        bio: { en: 'ENT specialist with focus on sleep apnea.', ar: 'أخصائي أنف وأذن وحنجرة يركز على انقطاع النفس أثناء النوم.' }
    },
    {
        name: { en: 'Dr. Aisha Al-Barasi', ar: 'د. عائشة البراصي' },
        email: 'aisha.b@clinic.ly',
        specialty: 'General Surgery',
        gender: 'Female',
        hospitalIndices: [1],
        bio: { en: 'General surgeon specializing in breast surgery.', ar: 'جراحة عامة متخصصة في جراحة الثدي.' }
    },
    {
        name: { en: 'Dr. Yousef Al-Qalib', ar: 'د. يوسف قليب' },
        email: 'yousef.q@clinic.ly',
        specialty: 'Internal Medicine',
        gender: 'Male',
        hospitalIndices: [2, 3],
        bio: { en: 'Specialist in infectious diseases.', ar: 'أخصائي في الأمراض المعدية.' }
    },
    {
        name: { en: 'Dr. Nuri Al-Mangoush', ar: 'د. نوري المنقوش' },
        email: 'nuri.m@clinic.ly',
        specialty: 'Ophthalmology',
        gender: 'Male',
        hospitalIndices: [0, 2],
        bio: { en: 'Expert in glaucoma treatment.', ar: 'خبير في علاج المياه الزرقاء.' }
    },
    {
        name: { en: 'Dr. Layla Al-Aboud', ar: 'د. ليلى عبود' },
        email: 'layla.ab@clinic.ly',
        specialty: 'Dentistry',
        gender: 'Female',
        hospitalIndices: [0, 1],
        bio: { en: 'Specialist in orthodontics.', ar: 'أخصائية في تقويم الأسنان.' }
    },
    {
        name: { en: 'Dr. Tarek Al-Fassi', ar: 'د. طارق الفاسي' },
        email: 'tarek.f@clinic.ly',
        specialty: 'Obstetrics and Gynecology',
        gender: 'Male',
        hospitalIndices: [1],
        bio: { en: 'Specialist in reproductive endocrinology.', ar: 'أخصائي في الغدد الصماء التناسلية.' }
    },
    {
        name: { en: 'Dr. Muna Al-Misrati', ar: 'د. منى المصراتي' },
        email: 'muna.m@clinic.ly',
        specialty: 'Cardiology',
        gender: 'Female',
        hospitalIndices: [0],
        bio: { en: 'Expert in echocardiography.', ar: 'خبيرة في تصوير القلب بالصدى.' }
    },
    {
        name: { en: 'Dr. Ahmed Al-Warfalli', ar: 'د. أحمد الورفلي' },
        email: 'ahmed.w@clinic.ly',
        specialty: 'Dermatology',
        gender: 'Male',
        hospitalIndices: [0],
        bio: { en: 'Specialist in skin cancer surgery.', ar: 'أخصائي في جراحة سرطان الجلد.' }
    },
    {
        name: { en: 'Dr. Laila Al-Mahdi', ar: 'د. ليلى المهدي' },
        email: 'laila.m@clinic.ly',
        specialty: 'Pediatrics',
        gender: 'Female',
        hospitalIndices: [1],
        bio: { en: 'Pediatrician focused on adolescent medicine.', ar: 'طبيبة أطفال تركز على طب المراهقين.' }
    },
    {
        name: { en: 'Dr. Sami Al-Zawi', ar: 'د. سامي الزاوي' },
        email: 'sami.z@clinic.ly',
        specialty: 'Orthopedics',
        gender: 'Male',
        hospitalIndices: [1],
        bio: { en: 'Specialist in spinal surgery.', ar: 'أخصائي في جراحة العمود الفقري.' }
    },
    {
        name: { en: 'Dr. Hana Al-Fitouri', ar: 'د. هناء الفيتوري' },
        email: 'hana.f@clinic.ly',
        specialty: 'Otolaryngology (ENT)',
        gender: 'Female',
        hospitalIndices: [2],
        bio: { en: 'ENT specialist focused on voice disorders.', ar: 'أخصائية أنف وأذن وحنجرة تركز على اضطرابات الصوت.' }
    },
    {
        name: { en: 'Dr. Mustafa Al-Sayed', ar: 'د. مصطفى السيد' },
        email: 'mustafa.s@clinic.ly',
        specialty: 'General Surgery',
        gender: 'Male',
        hospitalIndices: [1],
        bio: { en: 'General surgeon with focus on colorectal surgery.', ar: 'جراح عام يركز على جراحة القولون والمستقيم.' }
    },
    {
        name: { en: 'Dr. Reem Al-Barasi', ar: 'د. ريم البراصي' },
        email: 'reem.b@clinic.ly',
        specialty: 'Internal Medicine',
        gender: 'Female',
        hospitalIndices: [1],
        bio: { en: 'Specialist in rheumatology.', ar: 'أخصائية في الروماتيزم.' }
    },
    {
        name: { en: 'Dr. Adel Al-Qalib', ar: 'د. عادل قليب' },
        email: 'adel.q@clinic.ly',
        specialty: 'Ophthalmology',
        gender: 'Male',
        hospitalIndices: [3],
        bio: { en: 'Expert in retinal diseases.', ar: 'خبير في أمراض الشبكية.' }
    },
    {
        name: { en: 'Dr. Nadia Al-Mangoush', ar: 'د. نادية المنقوش' },
        email: 'nadia.m@clinic.ly',
        specialty: 'Dentistry',
        gender: 'Female',
        hospitalIndices: [3],
        bio: { en: 'Specialist in pediatric dentistry.', ar: 'أخصائية في طب أسنان الأطفال.' }
    },
];

const patientData = [
    { name: { en: 'Ahmed Khalifa', ar: 'أحمد خليفة' }, email: 'ahmed@user.ly', phone: '0911234567', gender: 'Male' },
    { name: { en: 'Mona Al-Sayed', ar: 'منى السيد' }, email: 'mona@user.ly', phone: '0929876543', gender: 'Female' },
    { name: { en: 'Salem Al-Barasi', ar: 'سالم البراصي' }, email: 'salem@user.ly', phone: '0945551234', gender: 'Male' }
];

// --- HELPER FUNCTIONS ---

const generateAvailability = (hospitalIds) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const schedule = [];

    // Randomize availability slightly
    days.forEach(day => {
        const isAvailable = Math.random() > 0.3; // 70% chance of working
        if (isAvailable && hospitalIds.length > 0) {
            // Pick a random hospital from the doctor's assigned hospitals for this day
            const hospitalId = hospitalIds[Math.floor(Math.random() * hospitalIds.length)];
            schedule.push({
                dayOfWeek: day,
                isAvailable: true,
                startTime: '09:00',
                endTime: '15:00',
                hospital: hospitalId,
                announcement: Math.random() > 0.8 ? (day === 'Thursday' ? 'Half day only' : '') : ''
            });
        } else {
            schedule.push({
                dayOfWeek: day,
                isAvailable: false,
                startTime: '09:00',
                endTime: '17:00',
                hospital: null
            });
        }
    });
    return schedule;
};

const seedDatabase = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB connected for seeding.');

        /*
        console.log('🧹 Clearing existing data...');
        await Promise.all([
            Hospital.deleteMany({}),
            User.deleteMany({}),
            Appointment.deleteMany({}),
            Medication.deleteMany({}),
            Transaction.deleteMany({}),
            Reminder.deleteMany({}),
            Notification.deleteMany({}),
            EmergencyContact.deleteMany({}),
            RedeemCode.deleteMany({}),
            Specialty.deleteMany({}),
            AppointmentType.deleteMany({}),
            QueueItem.deleteMany({}),
            Wallet.deleteMany({}),
            MedicalReport.deleteMany({})
        ]);
        */

        // Drop indexes to ensure they are recreated based on the latest schema
        console.log('🔄 Dropping indexes for AppointmentType...');
        try {
            await AppointmentType.collection.dropIndexes();
            console.log('👍 AppointmentType indexes dropped.');
        } catch (e) {
            if (e.code === 26) {
                console.log('ℹ️ AppointmentType collection or indexes did not exist, skipping drop.');
            } else {
                throw e;
            }
        }

        // 1. Create Admins
        console.log('👤 Creating Admins...');
        const superAdminData = {
            name: { en: 'System Admin', ar: 'مدير النظام' },
            email: 'admin@myclinic.ly',
            password: 'Password123',
            phone: '0910000000',
            role: 'super admin',
            isActive: true
        };
        
        let superAdmin = await User.findOne({ email: superAdminData.email });
        if (!superAdmin) {
            superAdmin = new User(superAdminData);
            await superAdmin.save();
        } else {
            superAdmin.name = superAdminData.name;
            superAdmin.password = superAdminData.password;
            superAdmin.phone = superAdminData.phone;
            superAdmin.role = superAdminData.role;
            superAdmin.isActive = superAdminData.isActive;
            await superAdmin.save();
        }

        const hospitalManagerData = {
            name: { en: 'Hospital Manager', ar: 'مدير المستشفى' },
            email: 'manager@myclinic.ly',
            password: 'Password123',
            phone: '0910000001',
            role: 'hospital manager',
            isActive: true
        };
        
        let hospitalManager = await User.findOne({ email: hospitalManagerData.email });
        if (!hospitalManager) {
            hospitalManager = new User(hospitalManagerData);
            await hospitalManager.save();
        } else {
            hospitalManager.name = hospitalManagerData.name;
            hospitalManager.password = hospitalManagerData.password;
            hospitalManager.phone = hospitalManagerData.phone;
            hospitalManager.role = hospitalManagerData.role;
            hospitalManager.isActive = hospitalManagerData.isActive;
            await hospitalManager.save();
        }

        // 2. Create Hospitals
        console.log('🏥 Creating Hospitals...');
        const createdHospitals = [];
        for (const hData of hospitalsData) {
            const h = await Hospital.findOneAndUpdate({ "name.en": hData.name.en }, hData, { upsert: true, new: true });
            createdHospitals.push(h);
        }

        // Assign manager to the first hospital
        createdHospitals[0].manager = hospitalManager._id;
        await createdHospitals[0].save();
        hospitalManager.hospitals = [createdHospitals[0]._id];
        await hospitalManager.save();

        // 3. Create Specialties for Each Hospital
        console.log('🩺 Creating Specialties...');
        const hospitalSpecialtyMap = {}; // Map[hospitalId][specialtyNameEn] = specialtyId

        for (const hospital of createdHospitals) {
            hospitalSpecialtyMap[hospital._id] = {};
            for (const specData of specialtiesList) {
                const spec = await Specialty.findOneAndUpdate(
                    { "name.en": specData.en, hospital: hospital._id },
                    { name: specData, hospital: hospital._id },
                    { upsert: true, new: true }
                );
                hospitalSpecialtyMap[hospital._id][specData.en] = spec._id;

                // Create 4 Standard Appointment Types for EVERY specialty
                for (const service of standardServices) {
                    await AppointmentType.findOneAndUpdate(
                        { "name.en": service.name.en, hospital: hospital._id, specialty: spec._id },
                        {
                            name: service.name,
                            duration: service.duration,
                            cost: service.cost,
                            hospital: hospital._id,
                            specialty: spec._id,
                            createdBy: superAdmin._id
                        },
                        { upsert: true }
                    );
                }
            }
        }

        // 4. Create Doctors
        console.log('👨‍⚕️ Creating Doctors...');
        const createdDoctors = [];

        for (const docData of doctorsData) {
            const assignedHospitals = docData.hospitalIndices.map(i => createdHospitals[i]._id);
            const assignedSpecialties = [];

            // Gather specialty IDs from the map based on the doctor's specialty name
            assignedHospitals.forEach(hId => {
                const sId = hospitalSpecialtyMap[hId][docData.specialty];
                if (sId) assignedSpecialties.push(sId);
            });

            let doctor = await User.findOne({ email: docData.email });
            const doctorFields = {
                name: docData.name,
                email: docData.email,
                password: 'Password123',
                phone: '091' + Math.floor(1000000 + Math.random() * 9000000),
                role: 'doctor',
                bio: docData.bio,
                gender: docData.gender,
                isActive: true,
                isDisabled: false,
                hospitals: assignedHospitals,
                specialties: assignedSpecialties,
                availability: generateAvailability(assignedHospitals)
            };

            if (!doctor) {
                doctor = new User(doctorFields);
                await doctor.save();
            } else {
                Object.assign(doctor, doctorFields);
                await doctor.save();
            }
            createdDoctors.push(doctor);
        }

        // 5. Create Patients
        console.log('🧑‍🤝‍🧑 Creating Patients...');
        const createdPatients = [];
        for (const pData of patientData) {
            let patient = await User.findOne({ email: pData.email });
            const patientFields = {
                name: pData.name,
                email: pData.email,
                password: 'Password123',
                phone: pData.phone,
                role: 'patient',
                isActive: true,
                medicalProfile: {
                    bloodType: Math.random() > 0.5 ? 'O+' : 'A+',
                    height: 170 + Math.floor(Math.random() * 20),
                    weight: 70 + Math.floor(Math.random() * 20),
                    allergies: Math.random() > 0.7 ? ['Penicillin'] : [],
                    chronicConditions: Math.random() > 0.8 ? ['Asthma'] : []
                }
            };

            if (!patient) {
                patient = new User(patientFields);
                await patient.save();
            } else {
                Object.assign(patient, patientFields);
                await patient.save();
            }

            // Create Wallet if doesn't exist
            const existingWallet = await Wallet.findOne({ user: patient._id });
            if (!existingWallet) {
                await Wallet.create({
                    user: patient._id,
                    balance: 2000.00, // Generous starting money for testing surgery fees
                    currency: 'LYD'
                });
            }

            createdPatients.push(patient);
        }

        // 6. Create Sample Appointments & Transactions
        console.log('📅 Creating Appointments...');
        const today = new Date();
        const dates = [
            new Date(today).toISOString().split('T')[0], // Today
            new Date(today.setDate(today.getDate() + 1)).toISOString().split('T')[0], // Tomorrow
            new Date(today.setDate(today.getDate() - 5)).toISOString().split('T')[0]  // Past
        ];

        const mainPatient = createdPatients[0]; // Ahmed
        const mainDoctor = createdDoctors[0]; // Dr. Khaled (Cardio) in Tripoli Univ
        const mainHospital = createdHospitals[0]; // Tripoli Univ

        // Find appointment types (Look for 'Checkup' since 'Consultation' is removed)
        const checkupType = await AppointmentType.findOne({
            hospital: mainHospital._id,
            specialty: mainDoctor.specialties[0],
            'name.en': 'Checkup'
        });

        if (checkupType) {
            // Past Appointment
            await Appointment.create({
                user: mainPatient._id,
                doctor: mainDoctor._id,
                hospital: mainHospital._id,
                appointmentType: checkupType._id,
                date: dates[2],
                time: '10:00 AM',
                status: 'Completed',
                cost: checkupType.cost
            });

            // Upcoming Appointment
            const upcomingAppt = await Appointment.create({
                user: mainPatient._id,
                doctor: mainDoctor._id,
                hospital: mainHospital._id,
                appointmentType: checkupType._id,
                date: dates[1],
                time: '09:00 AM',
                status: 'Upcoming',
                cost: checkupType.cost
            });

            // Queue Item for today (if doctor works today) - Force Dr. Khaled to work today at Tripoli Univ
            await QueueItem.create({
                user: mainPatient._id,
                doctor: mainDoctor._id,
                hospital: mainHospital._id,
                queueNumber: 'K001',
                status: 'Waiting',
                checkInTime: new Date()
            });
        }

        /*
        // 7. Create Pharmacy Data
        console.log('💊 Creating Medications...');
        await Medication.insertMany([
            {
                name: 'Panadol Extra',
                price: 7.50,
                form: 'Tablet',
                availableAt: [{ name: 'Al-Razi Pharmacy', address: 'Gergarish, Tripoli', distance: '2 km' }]
            },
            {
                name: 'Augmentin',
                price: 35.00,
                form: '1g Tablet',
                availableAt: [{ name: 'Al-Shifa', address: 'Ben Ashour, Tripoli', distance: '5 km' }]
            },
            {
                name: 'Cataflam',
                price: 12.00,
                form: '50mg Tablet',
                availableAt: [{ name: 'Makkah Pharmacy', address: 'Dubai St, Benghazi', distance: '1 km' }]
            }
        ]);
        */

        console.log('✅ Database seeded successfully with Libyan Context and Standard Services!');
    } catch (error) {
        console.error('❌ Error seeding database:', error);
    } finally {
        mongoose.connection.close();
        console.log('👋 MongoDB connection closed.');
    }
};

seedDatabase();
