require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/user');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/myClinicDB';
const NEW_PASSWORD = process.argv[2] || 'Password123';

async function run() {
    await mongoose.connect(MONGO_URI);
    const doctors = await User.find({ role: 'doctor' }).select('+password');

    if (!doctors.length) {
        console.log('No doctors found to update.');
        await mongoose.disconnect();
        return;
    }

    console.log(`Resetting password for ${doctors.length} doctors...`);
    for (const doc of doctors) {
        doc.password = NEW_PASSWORD; // set new password
        doc.markModified('password'); // force hashing even if value matches
        await doc.save({ validateBeforeSave: true });
        console.log(`✔ Updated: ${doc.email}`);
    }

    await mongoose.disconnect();
    console.log('Done. Use the new password to log in.');
}

run().catch(err => {
    console.error(err);
    mongoose.disconnect();
});
