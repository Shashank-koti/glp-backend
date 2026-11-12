import mongoose from 'mongoose';
import dns from 'dns';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is always loaded regardless of working directory or import order
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

// Fix for Node.js 18+ on Windows: Force IPv4 first to prevent 30s timeout on SRV records
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore if not supported
}

// Global cache for serverless environments (Vercel)
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

// Connection lifecycle listeners (no auto-reconnect)
mongoose.connection.on('connected', () => {
  console.log(`[MongoDB] Connected successfully to host: ${mongoose.connection.host}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB] Disconnected from server.');
  cached.conn = null;
  cached.promise = null;
});

const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  const mongoURI = process.env.MONGO_URI;
  if (!mongoURI) {
    const err = new Error('Please define the MONGO_URI environment variable inside backend/.env');
    console.error(`[MongoDB Error] ${err.message}`);
    throw err;
  }

  // Parse URI to extract and safely display target details without exposing passwords
  let targetHost = 'unknown';
  let targetDb = 'unknown';
  let authDb = '';
  try {
    const parsed = new URL(mongoURI);
    targetHost = parsed.host;
    targetDb = parsed.pathname.replace(/^\//, '') || 'unknown';
    authDb = parsed.searchParams.get('authSource') || targetDb;
  } catch (e) {
    // Non-standard URI format
  }

  const opts = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 25,
    family: 4, // Force IPv4 in MongoDB driver
  };

  try {
    cached.promise = mongoose.connect(mongoURI, opts);
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    cached.conn = null;

    console.error('\n==================== [MongoDB Connection Error] ====================');
    console.error(`Error Name    : ${error.name}`);
    console.error(`Error Message : ${error.message}`);
    console.error(`Target Host   : ${targetHost}`);
    console.error(`Database      : ${targetDb}`);
    if (authDb) {
      console.error(`Auth Source   : ${authDb}`);
    }

    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n[Root Cause - Connection Refused]:');
      if (targetHost.includes('127.0.0.1') || targetHost.includes('localhost')) {
        console.error('-> You are attempting to connect to 127.0.0.1 (localhost).');
        console.error('   There is NO MongoDB server running locally on your computer.');
        console.error('-> Because you are using a remote VPS MongoDB community server:');
        console.error('   1. In backend/.env, change 127.0.0.1 to your VPS IP address.');
        console.error('      Example: MONGO_URI=mongodb://glpApp:<pwd>@<VPS_IP>:27017/glp_pharma?authSource=glp_pharma');
        console.error('   2. OR start an SSH tunnel from your computer to the VPS:');
        console.error('      ssh -N -L 27017:127.0.0.1:27017 root@<VPS_IP>');
      } else {
        console.error(`-> The VPS at ${targetHost} actively refused connection on port 27017.`);
        console.error('   Check if MongoDB is running on VPS: sudo systemctl status mongod');
      }
    } else if (error.message.includes('timed out') || error.name === 'MongooseServerSelectionError') {
      console.error('\n[Root Cause - Connection Timed Out / Unreachable]:');
      console.error(`-> Could not reach ${targetHost} on port 27017 within 5 seconds.`);
      console.error('-> On your VPS, check:');
      console.error('   1. In /etc/mongod.conf, ensure bindIp is set to 0.0.0.0 (not 127.0.0.1).');
      console.error('   2. Allow port 27017 in VPS firewall: sudo ufw allow 27017/tcp');
      console.error('   3. If using AWS/DigitalOcean/Hetzner, allow port 27017 in cloud firewall.');
    } else if (error.message.includes('Authentication') || error.message.includes('auth')) {
      console.error('\n[Root Cause - Authentication Failed]:');
      console.error('-> MongoDB rejected your username or password.');
      console.error('-> Check your password and authSource database:');
      console.error('   If user was created in admin db, set authSource=admin');
    }
    console.error('====================================================================\n');

    throw error;
  }
};

export default connectDB;
