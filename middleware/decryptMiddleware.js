const { decryptData } = require('../utils/encryption');

const decryptRequest = (req, res, next) => {
    // Check if the body has a 'payload' property (our marker for encrypted data)
    if (req.body && req.body.payload && Object.keys(req.body).length === 1) {
        const decrypted = decryptData(req.body.payload);
        
        if (!decrypted) {
            return res.status(400).json({ error: 'Data decryption failed. Invalid payload.' });
        }

        // Replace the encrypted body with the decrypted object
        // So controllers downstream don't know encryption happened
        req.body = decrypted;
    }
    next();
};

module.exports = decryptRequest;
