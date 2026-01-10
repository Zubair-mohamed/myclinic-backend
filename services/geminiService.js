
const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.API_KEY;
const isPlaceholderKey = !apiKey || apiKey === 'your_google_api_key_here';
const client = !isPlaceholderKey ? new GoogleGenAI({ apiKey }) : null;

if (!client) {
    console.warn("API_KEY environment variable not set or is placeholder. AI features will use mock data.");
}

const getMockChatResponse = (message, history, language) => {
    const isAr = language === 'ar';
    const lowerMessage = message.toLowerCase();

    let text = isAr 
        ? "أنا أعمل حالياً في وضع التجربة (Mock Mode). يرجى تزويد مفتاح API صالح في ملف .env لتفعيل ميزات الذكاء الاصطناعي الكاملة. كيف يمكنني مساعدتك؟"
        : "I am currently running in Mock Mode. Please provide a valid API key in the .env file to enable full AI features. How can I help you?";

    if (lowerMessage.match(/ألم|وجع|تعب|pain|hurt|sick/)) {
        text = isAr
            ? "يؤسفني سماع أنك لا تشعر بخير. هل يمكنك إخباري بمزيد من التفاصيل عن الأعراض التي تشعر بها؟"
            : "I'm sorry to hear you're not feeling well. Could you tell me more details about the symptoms you're experiencing?";
    } else if (lowerMessage.match(/حجز|موعد|book|appointment/)) {
        text = isAr
            ? "بالتأكيد، يمكنني مساعدتك في حجز موعد. ما هو التخصص الذي تبحث عنه؟"
            : "Certainly, I can help you book an appointment. What specialty are you looking for?";
    }

    return {
        text: text,
        isComplete: false
    };
};

const getMockAnalysis = (symptoms, specialties, language) => {
    const isAr = language === 'ar';
    const lowerSymptoms = symptoms.toLowerCase();

    // Helper to find specialty by English or Arabic name
    const findSpec = (keywords) => {
        return specialties.find(s =>
            keywords.some(k => s.name.en.toLowerCase().includes(k) || s.name.ar.includes(k))
        );
    };

    let recommendedSpecialty = null;
    let condition = isAr ? "حالة غير محددة" : "Undetermined Condition";
    let advice = isAr ? "يرجى زيارة الطبيب العام." : "Please visit a General Practitioner.";

    // --- Smart Keyword Matching Logic (Fallback AI) ---

    // 1. ENT (Ear, Nose, Throat)
    if (lowerSymptoms.match(/ear|hearing|nose|throat|dizzy|vertigo|ذن|سمع|أنف|حنجرة|دوخة/)) {
        recommendedSpecialty = findSpec(['Otolaryngology', 'ENT', 'الأنف', 'أذن']);
        condition = isAr ? "التهاب محتمل في الأذن أو الحنجرة" : "Possible ENT Infection";
    }

    // 2. Cardiology (Heart)
    else if (lowerSymptoms.match(/heart|chest|palpitation|breath|قلب|صدر|خفقان|نفس/)) {
        recommendedSpecialty = findSpec(['Cardiology', 'القلب']);
        condition = isAr ? "أعراض قلبية وعائية" : "Cardiovascular Symptoms";
        advice = isAr ? "يرجى التوجه للطوارئ إذا كان الألم شديداً." : "Please go to ER if pain is severe.";
    }

    // 3. Dermatology (Skin)
    else if (lowerSymptoms.match(/skin|rash|itch|acne|spot|جلد|طفح|حكة|حب|بقع/)) {
        recommendedSpecialty = findSpec(['Dermatology', 'الجلدية']);
        condition = isAr ? "مشكلة جلدية" : "Dermatological Issue";
    }

    // 4. Pediatrics (Child/Baby)
    else if (lowerSymptoms.match(/child|baby|kid|son|daughter|طفل|رضيع|ابني|ابنتي|صغير/)) {
        recommendedSpecialty = findSpec(['Pediatrics', 'الأطفال']);
        condition = isAr ? "وعكة صحية للأطفال" : "Pediatric Concern";
    }

    // 5. Orthopedics (Bone/Joint)
    else if (lowerSymptoms.match(/bone|joint|knee|back|pain|break|fracture|عظم|مفصل|ركبة|ظهر|كسر/)) {
        recommendedSpecialty = findSpec(['Orthopedics', 'العظام']);
        condition = isAr ? "ألم عضلي هيكلي" : "Musculoskeletal Pain";
    }

    // 6. Dentistry (Teeth)
    else if (lowerSymptoms.match(/tooth|teeth|gum|jaw|أسنان|ضرس|لثة|فك/)) {
        recommendedSpecialty = findSpec(['Dentistry', 'الأسنان']);
        condition = isAr ? "ألم في الأسنان" : "Dental Pain";
    }

    // 7. Ophthalmology (Eye)
    else if (lowerSymptoms.match(/eye|vision|blur|عين|رؤية|نظر/)) {
        recommendedSpecialty = findSpec(['Ophthalmology', 'العيون']);
        condition = isAr ? "مشكلة في العيون" : "Ophthalmic Issue";
    }

    // Fallback to GP or Internal Medicine if nothing matched
    if (!recommendedSpecialty) {
        recommendedSpecialty = findSpec(['General Practitioner', 'Family Medicine', 'Internal Medicine', 'طبيب عام', 'طب الأسرة', 'باطني']);
        condition = isAr ? "أعراض عامة" : "General Symptoms";
    }

    // Absolute Fallback if list is empty
    if (!recommendedSpecialty) {
        recommendedSpecialty = specialties.length > 0 ? specialties[0] : { _id: 'mock_id', name: { en: 'General Practitioner', ar: 'طبيب عام' } };
    }

    return {
        possibleCondition: condition + (isAr ? " (تحليل ذكي)" : " (Smart Fallback)"),
        urgency: "Medium",
        explanation: isAr
            ? `بناءً على ذكرك لـ "${symptoms}"، يبدو أن التخصص الأنسب هو ${recommendedSpecialty.name.ar}.`
            : `Based on your mention of "${symptoms}", the most appropriate specialty seems to be ${recommendedSpecialty.name.en}.`,
        recommendedSpecialtyId: recommendedSpecialty._id.toString(),
        recommendedSpecialtyName: isAr ? recommendedSpecialty.name.ar : recommendedSpecialty.name.en,
        advice: advice
    };
};

const analyzeSymptoms = async (symptoms, patientProfile, availableSpecialties, language = 'en') => {
    // If key is missing, use the smart keyword matcher immediately
    if (!client) {
        return getMockAnalysis(symptoms, availableSpecialties, language);
    }

    // Create a map of specialty names to IDs to help the AI choose valid IDs
    const specialtyListString = availableSpecialties.map(s => `- ID: "${s._id}" | Name: "${s.name.en}" / "${s.name.ar}"`).join('\n');

    const targetLanguage = language === 'ar' ? 'Arabic' : 'English';

    const systemInstruction = `
        You are an expert Medical Triage AI assistant for a clinic.
        
        **YOUR TASK:**
        1. Analyze the patient's raw symptoms input.
        2. Match it to the *single best* specialty from the provided list.
        3. Provide a brief medical reasoning.

        **STRICT RULES:**
        - **ID MATCHING:** You MUST return the EXACT ID from the list below for the "recommendedSpecialtyId" field. Do NOT invent new IDs.
        - **INPUT SENSITIVITY:** You MUST change your answer based on the input.
        - **SURGERY RULE:** Do NOT recommend "General Surgery" unless there is explicit mention of a wound or lump.
        - **CHILD RULE:** If words like "child", "baby", "son", "daughter" appear, prioritize 'Pediatrics'.
        - **LANGUAGE:** Return the response fields in ${targetLanguage}.
        
        **AVAILABLE SPECIALTIES LIST (USE EXACT ID FROM HERE):**
        ${specialtyListString}
    `;

    const prompt = `
        **Patient Context:**
        - Age: ${patientProfile.age}
        
        **Patient Symptoms Input:**
        "${symptoms}"

        Based strictly on the symptoms above, provide the diagnosis and recommendation in JSON format.
    `;

    try {
        const response = await client.models.generateContent({
            model: "gemini-flash-latest",
            systemInstruction: systemInstruction,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        possibleCondition: { type: 'STRING' },
                        urgency: { type: 'STRING' },
                        explanation: { type: 'STRING' },
                        recommendedSpecialtyId: { type: 'STRING' },
                        recommendedSpecialtyName: { type: 'STRING' },
                        advice: { type: 'STRING' }
                    },
                    required: ["possibleCondition", "urgency", "explanation", "recommendedSpecialtyId", "recommendedSpecialtyName", "advice"]
                },
            },
        });

        return JSON.parse(response.text.trim());

    } catch (error) {
        console.error("Error analyzing symptoms with Gemini (falling back to keyword matcher):", error.message);
        // Fallback to smart keyword matcher on API error
        return getMockAnalysis(symptoms, availableSpecialties, language);
    }
};

/**
 * Conversational AI Chat (Idea 1, 4, 6, 7, 8)
 * Supports history and provides smart recommendations based on real-time data
 */
const chatWithAi = async (message, history, patientProfile, availableSpecialties, doctors, queueData, language = 'ar') => {
    if (!client) {
        return getMockChatResponse(message, history, language);
    }

    const specialtyListString = availableSpecialties.map(s => `- ID: "${s._id}" | Name: "${s.name?.en || ''}" / "${s.name?.ar || ''}"`).join('\n');
    
    // Prepare doctor list for Semantic Search (Idea 8)
    const doctorListString = doctors.map(d => {
        // d.name is an i18n object {en, ar}
        const docName = d.name?.en || d.name?.ar || 'Doctor';
        // d.specialties is an array of IDs
        let specName = 'General';
        if (d.specialties && d.specialties.length > 0) {
            const spec = availableSpecialties.find(s => s._id.toString() === d.specialties[0].toString());
            if (spec) specName = spec.name?.en || 'General';
        }
        return `- Doctor: "${docName}" | Specialty: "${specName}" | ID: "${d._id}"`;
    }).join('\n');

    // Prepare Queue Context for Wait Time Prediction (Idea 6)
    const queueContext = queueData.userStatus.inQueue 
        ? `Patient is currently in queue for Dr. ${queueData.userStatus.doctor?.name}. Position: ${queueData.userStatus.position}, Est. Wait: ${queueData.userStatus.estimatedWaitTime} mins.`
        : `Patient is not in queue. Average wait time across clinic is 15-30 mins.`;

    const targetLanguage = language === 'ar' ? 'Arabic' : 'English';

    const systemInstruction = `
        You are an expert Medical Triage AI assistant for "My Clinic" app.
        
        **CRITICAL MISSION:**
        Your primary job is to **schedule the patient** with the right doctor as quickly as possible. You are a "Booking Assistant", not just a chat bot.
        
        **YOUR GOALS:**
        1. **Conversational Triage (Idea 1):** Ask only essential questions.
        2. **Wait Time Prediction (Idea 6):** Inform the patient about wait times when recommending a doctor.
        3. **Smart Scheduling (Idea 4):** Suggest the best specialty/doctor based on symptoms. **STRICT RULE: Aim to provide a "recommendation" within 1-3 exchanges.** 
        4. **Direct Referral:** As soon as a specialty or doctor is identified, set "isComplete" to true and provide the "recommendation" object.

        **CONVERSATIONAL RULES:**
        1. Be empathetic but efficient.
        2. **Option-Driven Diagnostic Flow:** Provide 2-4 clear "options" (buttons).
        3. **Direct Action:** If the patient says "I want a dentist" or "my tooth hurts", provide the dental recommendation immediately.
        4. Always respond in ${targetLanguage}.

        **REAL-TIME CONTEXT:**
        - Patient Name: ${patientProfile.name}
        - Queue Status: ${queueContext}
        - Upcoming Appointments: ${JSON.stringify(patientProfile.upcomingAppointments)}

        **SPECIALTIES AVAILABLE:**
        ${specialtyListString}

        **DOCTORS AVAILABLE:**
        ${doctorListString}

        **RESPONSE FORMAT (JSON ONLY):**
        {
            "text": "Your message to the patient (Include wait time info if relevant)",
            "isComplete": true/false,
            "options": ["Option 1", "Option 2", "Option 3"],
            "recommendation": {
                "specialtyId": "ID from list",
                "specialtyName": "Name",
                "doctorId": "Optional Doctor ID if you found a specific match",
                "doctorName": "Optional Doctor Name",
                "urgency": "Low/Medium/High",
                "reason": "Brief explanation including why this doctor/specialty and wait time estimate"
            }
        }
    `;

    try {
        console.log("Calling Gemini AI with message:", message);
        const contents = [
            ...history.map(h => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.text }]
            })),
            { role: 'user', parts: [{ text: message }] }
        ];

        const response = await client.models.generateContent({
            model: "gemini-flash-latest",
            systemInstruction: systemInstruction,
            contents: contents,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        text: { type: 'STRING' },
                        isComplete: { type: 'BOOLEAN' },
                        options: {
                            type: 'ARRAY',
                            items: { type: 'STRING' }
                        },
                        recommendation: {
                            type: 'OBJECT',
                            properties: {
                                specialtyId: { type: 'STRING' },
                                specialtyName: { type: 'STRING' },
                                doctorId: { type: 'STRING' },
                                doctorName: { type: 'STRING' },
                                urgency: { type: 'STRING' },
                                reason: { type: 'STRING' }
                            }
                        }
                    },
                    required: ["text", "isComplete"]
                }
            }
        });

        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText);

        // --- Fallback & Robustness Check ---
        // If the AI recommended a specialty name but no specialtyId (or invalid one)
        if (result.recommendation && result.recommendation.specialtyName) {
            const r = result.recommendation;
            const providedId = r.specialtyId;
            
            // Check if providedId is valid in our list
            const isValidId = availableSpecialties.some(s => s._id.toString() === providedId);
            
            if (!providedId || !isValidId) {
                // Try to find a match by name (Fuzzy match)
                const searchTerm = r.specialtyName.toLowerCase();
                const match = availableSpecialties.find(s => {
                    const en = (s.name?.en || '').toLowerCase();
                    const ar = (s.name?.ar || '').toLowerCase();
                    return en === searchTerm || ar === searchTerm || 
                           searchTerm.includes(en) || searchTerm.includes(ar) ||
                           en.includes(searchTerm) || ar.includes(searchTerm);
                });
                
                if (match) {
                    result.recommendation.specialtyId = match._id.toString();
                    // Keep the original name for UI unless it was totally missing
                    if (!result.recommendation.specialtyName) {
                        result.recommendation.specialtyName = match.name;
                    }
                }
            }
        }

        // Similar fallback for doctorId
        if (result.recommendation && result.recommendation.doctorName && !result.recommendation.doctorId) {
            const searchTerm = result.recommendation.doctorName.toLowerCase();
            const match = doctors.find(d => {
                const en = (d.name?.en || '').toLowerCase();
                const ar = (d.name?.ar || '').toLowerCase();
                return en.includes(searchTerm) || ar.includes(searchTerm) || 
                       searchTerm.includes(en) || searchTerm.includes(ar);
            });
            if (match) {
                result.recommendation.doctorId = match._id.toString();
            }
        }

        return result;

    } catch (error) {
        console.error("Chat error:", error);
        return {
            text: language === 'ar' ? "حدث خطأ أثناء معالجة طلبك." : "An error occurred while processing your request.",
            isComplete: false
        };
    }
};

module.exports = { analyzeSymptoms, chatWithAi };

