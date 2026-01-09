const mongoose = require('mongoose');
const Hospital = require('./models/hospital');
const Pharmacy = require('./models/pharmacy');
const Medication = require('./models/medication');

const MONGO_URI = 'mongodb://localhost:27017/myClinicDB';

async function seed() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const hospitals = await Hospital.find({});
    if (hospitals.length === 0) {
        console.log('No hospitals found. Please seed hospitals first.');
        process.exit(1);
    }

    // Clear existing pharmacies and medications
    await Pharmacy.deleteMany({});
    await Medication.deleteMany({});

    for (const hospital of hospitals) {
        const pharmacyNameAr = `صيدلية ${hospital.name.ar}`;
        const pharmacyNameEn = `${hospital.name.en} Pharmacy`;

        const pharmacy = await Pharmacy.create({
            name: { ar: pharmacyNameAr, en: pharmacyNameEn },
            address: hospital.address,
            hospital: hospital._id,
            distance: `${(Math.random() * 5 + 1).toFixed(1)} km`
        });

        console.log(`Created pharmacy: ${pharmacy.name.en}`);

        // Create some medications for this pharmacy
        const meds = [
            {
                name: 'Panadol Extra',
                price: 7.50,
                form: 'Tablet',
                image: 'assets/images/panadol.jpg',
                pharmacy: pharmacy._id
            },
            {
                name: 'Cataflam',
                price: 12.00,
                form: '50mg Tablet',
                image: 'assets/images/cataflam.png',
                pharmacy: pharmacy._id
            },
            {
                name: 'Augmentin',
                price: 45.00,
                form: '1g Tablet',
                image: 'assets/images/augmentin.jpg',
                pharmacy: pharmacy._id
            },
            {
                name: 'Solpadeine',
                price: 15.00,
                form: 'Capsule',
                image: 'assets/images/solpadeine.png',
                pharmacy: pharmacy._id
            },
            {
                name: 'Brufen',
                price: 8.00,
                form: '400mg Tablet',
                image: 'assets/images/brufen.jpg',
                pharmacy: pharmacy._id
            },
            {
                name: 'Voltaren',
                price: 18.50,
                form: 'Gel',
                image: 'assets/images/voltarin.jpg',
                pharmacy: pharmacy._id
            }
        ];

        await Medication.insertMany(meds);
        console.log(`Added medications to ${pharmacy.name.en}`);
    }

    console.log('Seeding completed!');
    process.exit(0);
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
