// Utility script to drop the legacy unique index (doctor_1_date_1_time_1)
// Run once after enabling queue-based booking to allow multiple bookings per time slot.
// Usage: node scripts/dropAppointmentUniqueIndex.js

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/myClinicDB';

async function main() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const collection = db.collection('appointments');

  try {
    const indexes = await collection.indexes();
    const idx = indexes.find((i) => i.name === 'doctor_1_date_1_time_1');
    if (!idx) {
      console.log('Index doctor_1_date_1_time_1 not found; nothing to drop.');
    } else {
      await collection.dropIndex('doctor_1_date_1_time_1');
      console.log('Dropped index doctor_1_date_1_time_1 successfully.');
    }
  } catch (err) {
    console.error('Error dropping index:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

main();
