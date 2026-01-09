const express = require('express');
const router = express.Router();
const Specialty = require('../models/specialty');
const User = require('../models/user');
const geminiService = require('../services/geminiService');
const queueService = require('../services/queueService');
const { protect } = require('../middleware/auth');

// Lightweight rules engine for symptom triage
const specialtyRules = [
  { specialty: 'Cardiology', keywords: ['chest pain', 'angina', 'palpitations', 'heart racing', 'irregular heartbeat', 'shortness of breath', 'dyspnea', 'ألم في الصدر', 'خفقان', 'ضيق تنفس'] },
  { specialty: 'Pulmonology', keywords: ['cough', 'wheezing', 'asthma', 'shortness of breath', 'sputum', 'chest tightness', 'difficulty breathing', 'سعال', 'كحة', 'ربو', 'بلغم'] },
  { specialty: 'Gastroenterology', keywords: ['abdominal pain', 'stomach ache', 'vomiting', 'diarrhea', 'bloating', 'acid reflux', 'heartburn', 'constipation', 'nausea', 'ألم بطن', 'مغص', 'إسهال', 'إمساك', 'غثيان', 'حموضة'] },
  { specialty: 'Neurology', keywords: ['headache', 'migraine', 'dizziness', 'numbness', 'tingling', 'weakness', 'seizure', 'vision loss', 'speech difficulty', 'fainting', 'صداع', 'دوخة', 'تنميل', 'صرع'] },
  { specialty: 'ENT', keywords: ['ear pain', 'sore throat', 'nasal congestion', 'sinus', 'hearing loss', 'tinnitus', 'difficulty swallowing', 'ألم أذن', 'احتقان', 'جيوب أنفية', 'طنين'] },
  { specialty: 'Dermatology', keywords: ['rash', 'itching', 'acne', 'skin', 'lesion', 'hives', 'mole change', 'redness', 'طفح جلدي', 'حكة', 'حب شباب', 'حساسية جلدية'] },
  { specialty: 'Orthopedics', keywords: ['joint pain', 'back pain', 'knee pain', 'shoulder pain', 'swelling', 'fracture', 'bone pain', 'stiffness', 'ألم مفاصل', 'ألم ظهر', 'كسر', 'تورم'] },
  { specialty: 'Endocrinology', keywords: ['excessive thirst', 'weight loss', 'fatigue', 'thyroid', 'hypothyroid', 'hyperthyroid', 'diabetes', 'hormonal', 'عطش', 'غدة', 'سكري'] },
  { specialty: 'Urology', keywords: ['burning urination', 'blood in urine', 'frequent urination', 'urine', 'flank pain', 'kidney stones', 'حرقان بول', 'دم في البول', 'حصوات'] },
  { specialty: 'Gynecology', keywords: ['pelvic pain', 'pregnancy', 'vaginal bleeding', 'menstrual', 'menstruation', 'period', 'discharge', 'breast pain', 'حمل', 'دورة شهرية', 'ألم حوض'] },
  { specialty: 'Psychiatry', keywords: ['anxiety', 'depression', 'sleep', 'insomnia', 'panic', 'mood', 'hallucinations', 'قلق', 'اكتئاب', 'أرق', 'توتر'] },
  { specialty: 'Infectious Diseases', keywords: ['fever', 'chills', 'infection', 'flu', 'covid', 'pneumonia', 'night sweats', 'حرارة', 'سخونة', 'عدوى', 'انفلونزا'] },
  { specialty: 'Ophthalmology', keywords: ['eye pain', 'blurred vision', 'red eye', 'vision loss', 'double vision', 'ألم عين', 'غباش', 'رؤية'] },
  { specialty: 'Dentistry', keywords: ['tooth pain', 'toothache', 'gum pain', 'bleeding gums', 'cavity', 'dental', 'ألم أسنان', 'وجع أسنان', 'لثة', 'تسوس', 'ضرس'] },
  { specialty: 'Pediatrics', keywords: ['child', 'infant', 'baby', 'growth', 'vaccination', 'طفل', 'رضيع', 'تطعيم'] },
  { specialty: 'Internal Medicine', keywords: ['blood pressure', 'hypertension', 'anemia', 'general fatigue', 'chronic illness', 'ضغط الدم', 'فقر دم', 'خمول', 'تعب عام'] },
  { specialty: 'General Surgery', keywords: ['hernia', 'appendix', 'gallbladder', 'lump', 'swelling', 'فتق', 'زائدة دودية', 'مرارة', 'كتلة', 'ورم'] },
];

const vagueKeywords = ['pain', 'tired', 'fatigue', 'weakness', 'discomfort', 'unwell', 'sick', 'ألم', 'تعب', 'وجع', 'مريض', 'تعبان'];

const redFlags = [
  { keyword: 'chest pain', message: 'Chest pain with shortness of breath or sweating may need emergency care.' },
  { keyword: 'ألم في الصدر', message: 'ألم الصدر مع ضيق التنفس قد يتطلب عناية طارئة.' },
  { keyword: 'shortness of breath', message: 'Severe shortness of breath warrants urgent evaluation.' },
  { keyword: 'ضيق تنفس', message: 'ضيق التنفس الشديد يتطلب تقييماً عاجلاً.' },
  { keyword: 'weakness', message: 'Sudden weakness or numbness could be a stroke sign.' },
  { keyword: 'تنميل مفاجئ', message: 'الضعف المفاجئ أو التنميل قد يكون علامة على سكتة دماغية.' },
  { keyword: 'vision loss', message: 'Sudden vision loss requires immediate care.' },
  { keyword: 'فقدان الرؤية', message: 'فقدان الرؤية المفاجئ يتطلب عناية فورية.' },
  { keyword: 'severe headache', message: 'Worst headache of life can indicate serious condition.' },
  { keyword: 'صداع شديد جدا', message: 'أشد صداع في حياتك قد يشير إلى حالة خطيرة.' },
  { keyword: 'blood in vomit', message: 'Vomiting blood is an emergency.' },
  { keyword: 'دم في القيء', message: 'تقيؤ الدم حالة طارئة.' },
  { keyword: 'bloody stool', message: 'Bloody or black stool can indicate bleeding.' },
  { keyword: 'دم في البراز', message: 'البراز الدموي أو الأسود قد يشير إلى نزيف.' },
  { keyword: 'fainting', message: 'Loss of consciousness requires medical evaluation.' },
  { keyword: 'إغماء', message: 'فقدان الوعي يتطلب تقييماً طبياً.' },
];

const normalizeText = (text = '') => text.toLowerCase().trim();

const scoreSpecialties = (symptomText, age, gender) => {
  const normalized = normalizeText(symptomText);
  
  const scores = specialtyRules.map((rule) => {
    // Use word boundary or specific matching for better accuracy
    let hits = 0;
    rule.keywords.forEach(keyword => {
      if (normalized.includes(keyword.toLowerCase())) {
        hits++;
      }
    });
    
    // Contextual adjustments
    if (rule.specialty === 'Gynecology' && gender === 'male') hits = 0;
    if (rule.specialty === 'Pediatrics' && age > 18) hits = 0;
    
    // Boost for specific combinations
    if (rule.specialty === 'Cardiology' && normalized.includes('chest pain') && normalized.includes('shortness of breath')) hits += 2;

    return { specialty: rule.specialty, score: hits };
  });

  return scores.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
};

const calculateConfidence = (symptomText, topScore) => {
  const normalized = normalizeText(symptomText);
  const containsVague = vagueKeywords.some(vk => normalized.includes(vk));
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  
  if (topScore >= 3) return 'High';
  if (topScore >= 1 && wordCount >= 2) return 'Medium';
  if (topScore >= 1 && !containsVague) return 'Medium';
  return 'Low';
};

const detectUrgency = ({ severity, symptomsText, durationDays, age }) => {
  const normalized = normalizeText(symptomsText);
  const hasRedFlag = redFlags.filter((r) => normalized.includes(r.keyword));
  let level = 'Low';
  let advice = 'يمكنك حجز موعد عادي أو استشارة عبر الفيديو.';

  let priorityEmoji = '🟢';
  let priorityLabel = 'Routine';
  let nextStep = 'حجز موعد روتيني للفحص والمتابعة.';

  if (severity === 'severe' || hasRedFlag.length > 0) {
    level = 'High';
    advice = 'إذا كانت الأعراض شديدة أو تزداد سوءًا، يُفضّل التوجه للطوارئ فورًا.';
    priorityEmoji = '🔴';
    priorityLabel = 'Urgent';
    nextStep = 'توجّه للطوارئ فورًا أو اتصل بخدمات الطوارئ إذا تعذّر الحضور.';
  } else if (severity === 'moderate') {
    level = 'Medium';
    advice = 'ننصح بحجز موعد خلال 24-48 ساعة مع المختص المناسب.';
    priorityEmoji = '🟡';
    priorityLabel = 'Book soon';
    nextStep = 'احجز موعدًا خلال 24-48 ساعة مع التخصص المقترح.';
  }

  if (durationDays && durationDays >= 14 && level !== 'High') {
    level = 'Medium';
    priorityEmoji = '🟡';
    priorityLabel = 'Book soon';
  }

  if (age && age >= 65 && severity !== 'mild') {
    level = 'High';
    priorityEmoji = '🔴';
    priorityLabel = 'Urgent';
    nextStep = 'توجّه للطوارئ أو احجز استشارة عاجلة فورًا.';
  }

  return { level, advice, redFlags: hasRedFlag.map((r) => r.message), priorityEmoji, priorityLabel, nextStep };
};

router.post('/symptoms', async (req, res) => {
  try {
    const {
      symptoms,
      duration,
      severity = 'moderate',
      age,
      gender,
      chronicConditions = [],
      medications = [],
      additionalInfo = '',
      language = 'ar',
    } = req.body || {};

    const symptomsArray = Array.isArray(symptoms)
      ? symptoms.filter((s) => typeof s === 'string')
      : typeof symptoms === 'string'
        ? symptoms.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)
        : [];

    if (!symptomsArray.length) {
      return res.status(400).json({ error: 'symptoms is required (array or string).' });
    }

    const durationDays = duration ? parseInt(duration, 10) : null;
    const symptomText = symptomsArray.join(', ');

    const specialtyScores = scoreSpecialties(symptomText, age, gender);
    const topSpecialties = specialtyScores.slice(0, 2);
    
    const confidence = calculateConfidence(symptomText, topSpecialties[0]?.score || 0);

    const urgency = detectUrgency({
      severity: normalizeText(severity),
      symptomsText: symptomText,
      durationDays,
      age,
    });

    const primarySpecialty = topSpecialties.length > 0 ? topSpecialties[0].specialty : null;
    
    // 1️⃣ Symptom Interpretation (Conservative)
    let interpretation = '';
    if (confidence === 'Low') {
      interpretation = language === 'ar' 
        ? 'الأعراض المدخلة عامة جدًا ولا تسمح بتفسير دقيق حاليًا.' 
        : 'The symptoms provided are very general and do not allow for a precise interpretation at this time.';
    } else {
      interpretation = language === 'ar'
        ? `الأعراض قد تشير إلى حالة مرتبطة بـ ${primarySpecialty}، مع مراعاة المدة والشدة.`
        : `The symptoms may indicate a condition related to ${primarySpecialty}, considering the duration and severity.`;
    }

    // 2️⃣ Recommended Specialty
    let recommendedSpecialty = '';
    if (confidence === 'Low') {
      recommendedSpecialty = language === 'ar' ? 'لا يمكن تحديد تخصص بدقة حاليًا' : 'Cannot determine specialty accurately at this time';
    } else if (!primarySpecialty) {
      recommendedSpecialty = language === 'ar' ? 'طب عام' : 'General Medicine';
    } else {
      recommendedSpecialty = primarySpecialty;
    }

    // 3️⃣ Confidence Level
    const confidenceText = `${confidence} confidence`;

    // 4️⃣ Next Logical Step
    let nextLogicalStep = '';
    if (confidence === 'Low') {
      nextLogicalStep = language === 'ar' 
        ? 'يرجى تقديم تفاصيل أكثر عن مكان الألم أو الأعراض المصاحبة.' 
        : 'Please provide more details about the location of the pain or accompanying symptoms.';
    } else {
      nextLogicalStep = urgency.nextStep;
    }

    const safetyNote = language === 'ar'
      ? 'هذا التحليل مبدئي للغاية ويعتمد فقط على المعلومات المدخلة.'
      : 'This assessment is preliminary and does not replace a consultation with a qualified healthcare professional.';

    const analysis = language === 'ar'
      ? `١️⃣ تفسير الأعراض (محافظ): ${interpretation}\n٢️⃣ التخصص المقترح: ${recommendedSpecialty}\n٣️⃣ مستوى الثقة: ${confidenceText}\n٤️⃣ الخطوة المنطقية التالية: ${nextLogicalStep}\n\n${safetyNote}`
      : `1️⃣ Symptom Interpretation (Conservative): ${interpretation}\n2️⃣ Recommended Specialty: ${recommendedSpecialty}\n3️⃣ Confidence Level: ${confidenceText}\n4️⃣ Next Logical Step: ${nextLogicalStep}\n\n${safetyNote}`;

    const response = {
      analysis,
      interpretation,
      recommendedSpecialty,
      confidenceLevel: confidence,
      nextStep: nextLogicalStep,
      urgencyLevel: urgency.level,
      priorityEmoji: urgency.priorityEmoji,
      safetyNote,
      meta: { duration, severity, age, gender, language },
    };

    res.json(response);
  } catch (error) {
    console.error('AI symptoms error', error);
    res.status(500).json({ error: 'Server error while analyzing symptoms' });
  }
});

// Lightweight recommendations-only endpoint for repositories that expect it
router.post('/symptoms/recommendations', async (req, res) => {
  try {
    const { symptoms } = req.body || {};
    const symptomsArray = Array.isArray(symptoms)
      ? symptoms.filter((s) => typeof s === 'string')
      : typeof symptoms === 'string'
        ? symptoms.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)
        : [];

    if (!symptomsArray.length) {
      return res.status(400).json({ error: 'symptoms is required (array or string).' });
    }

    const symptomText = symptomsArray.join(', ');
    const specialtyScores = scoreSpecialties(symptomText);
    const top = specialtyScores.slice(0, 3).map((s) => ({ specialty: s.specialty, score: s.score }));

    if (!top.length) {
      top.push({ specialty: 'General Medicine', score: 0 });
    }

    res.json(top);
  } catch (error) {
    console.error('AI recommendations error', error);
    res.status(500).json({ error: 'Server error while recommending specialties' });
  }
});

// @desc    Conversational AI Chat (Idea 1, 4, 6, 8)
// @route   POST /api/ai/chat
// @access  Private
router.post('/chat', protect, async (req, res) => {
    const { message, history, language } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        // Fetch context for AI
        const specialties = await Specialty.find({}).select('name');
        const doctors = await User.find({ role: 'doctor' }).select('name specialties hospitals');
        
        // Get current queue status for wait time prediction (Idea 6)
        const queueData = await queueService.getPatientQueueStatus(req.user._id, req.user.hospitals);

        const patientProfile = {
            name: req.user.name,
            age: 30, // Default or from profile
            gender: req.user.gender || 'Unknown',
            chronicConditions: req.user.medicalProfile?.chronicConditions || [],
            upcomingAppointments: queueData.todaysAppointments || []
        };

        const result = await geminiService.chatWithAi(
            message,
            history || [],
            patientProfile,
            specialties,
            doctors,
            queueData,
            language || 'ar'
        );

        res.json(result);
    } catch (error) {
        console.error("AI Chat Route Error:", error);
        res.status(500).json({ error: 'Failed to process AI chat' });
    }
});

module.exports = router;
