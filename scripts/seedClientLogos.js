import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ClientLogo from '../src/models/ClientLogo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const seedClientLogos = async () => {
  const mongoURI = process.env.MONGO_URI;
  if (!mongoURI) {
    throw new Error('MONGO_URI is not defined in backend/.env');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoURI);
  console.log('MongoDB connected successfully.');

  const dataPath = path.resolve(__dirname, '../src/data/clientLogosData.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`clientLogosData.json not found at ${dataPath}`);
  }

  const clientLogos = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`Loaded ${clientLogos.length} client logos from clientLogosData.json`);

  // Clear existing clientlogos collection
  await ClientLogo.deleteMany({});
  console.log('Cleared existing client logos in MongoDB.');

  // Insert all into MongoDB
  const inserted = await ClientLogo.insertMany(clientLogos);
  console.log(`Successfully stored ${inserted.length} client images directly in MongoDB!`);

  // Verification count
  const countInDb = await ClientLogo.countDocuments();
  console.log(`Verification: Total client logos stored in MongoDB database = ${countInDb}`);

  await mongoose.disconnect();
  console.log('MongoDB disconnected.');
};

seedClientLogos().catch((err) => {
  console.error('Error seeding client logos:', err);
  mongoose.disconnect();
  process.exit(1);
});
