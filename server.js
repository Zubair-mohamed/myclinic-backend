
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const decryptRequest = require('./middleware/decryptMiddleware'); // Import decryption middleware

// Critical environment variable check
if (!process.env.JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in the environment variables. Please check your .env file.');
    process.exit(1); // Exit the process with an error code
}


const app = express();

// Middleware
app.use(cors());
// FIX: Increased the JSON payload limit to 10MB to allow for base64 image uploads.
app.use(express.json({ limit: '10mb' }));

// --- ENCRYPTION MIDDLEWARE ---
// Apply decryption before routes. This ensures req.body is readable by controllers.
app.use(decryptRequest);
// -----------------------------

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/myClinicDB';

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB connection error:', err));


// API Routes
app.use('/api', apiRoutes);

// Simple error handler
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error(`❌ Bad JSON from ${req.ip}: ${req.method} ${req.url}`);
        console.error('Error:', err.message);
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    console.error('Unhandled Error:', err.stack);
    res.status(500).send('Something broke!');
});

// Start reminder scheduler after MongoDB connection
mongoose.connection.once('open', () => {
    console.log('MongoDB Connected');

    // Start the doctor reminder scheduler
    try {
        const ReminderScheduler = require('./services/reminderScheduler');
        ReminderScheduler.start();
    } catch (error) {
        console.error('Failed to start reminder scheduler:', error);
        // Don't exit - server can still run without scheduler
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));