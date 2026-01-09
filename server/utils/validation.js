/**
 * Validates a Libyan phone number based on strict business rules:
 * - Starts with 091, 092, 093, 094, or 095
 * - Followed by exactly 7 digits
 * - Total length exactly 10 digits
 * 
 * @param {string} phone - The phone number to validate
 * @returns {boolean} - True if valid, false otherwise
 */
const isValidLibyanPhone = (phone) => {
    if (!phone) return false;
    const regex = /^(091|092|093|094|095)[0-9]{7}$/;
    return regex.test(phone);
};

module.exports = {
    isValidLibyanPhone
};
