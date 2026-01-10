const CryptoJS = require('crypto-js');

// Must match the Frontend Key
const SECRET_KEY = "MY_CLINIC_SECURE_KEY_LIBYA_2024";

const decryptData = (ciphertext) => {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);
        if (!originalText) return null;
        return JSON.parse(originalText);
    } catch (error) {
        console.error("Decryption Error:", error.message);
        return null;
    }
};

module.exports = { decryptData };
