import dns from 'dns';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Force IPv4 DNS resolution first on Windows to avoid IPv6 SRV timeouts
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables (supports running from repository root or backend folder)
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config();

import connectDB from './src/config/database.js';
import app from './src/app.js';

// Connect to database
connectDB().catch((err) => {
  console.error('Initial MongoDB Connection Error:', err.message);
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Handle unhandled promise rejections without crashing the server
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err?.message || err);
});

// Handle uncaught exceptions without crashing the server
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err?.message || err);
});
