import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Admin from '../src/models/Admin.js';

// Resolve path to .env file in backend/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function seedAdmin() {
    try {
        if (!mongoURI) {
            throw new Error('MONGO_URI is not defined in backend/.env');
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoURI);
        console.log('MongoDB connected successfully.');

        const adminEmail = 'admin@glppharma.com';
        const adminPassword = 'glpAdmin@2026';

        console.log(`Creating new admin account for "${adminEmail}"...`);

        const newAdmin = new Admin({
            name: 'GLP Super Admin',
            email: adminEmail,
            password: adminPassword,
            role: 'superadmin',
            company: 'GLP Pharma Standards',
            permissions: ['all'],
            isActive: true,
        });
        await Admin.save();
        console.log('Admin account created successfully!');

    } catch (error) {
        console.error('Error seeding admin:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB disconnected.');
        process.exit(0);
    }
}

seedAdmin();
