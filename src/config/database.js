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

// Connection lifecycle listeners to prevent unhandled EventEmitter errors
mongoose.connection.on('connected', () => {
  console.log(`[MongoDB] Connected successfully: ${mongoose.connection.host}`);
});

mongoose.connection.on('error', (err) => {
  console.error(`[MongoDB] Connection error: ${err.message}`);
});

let reconnectTimer = null;
const scheduleReconnect = (delay = 5000) => {
  if (reconnectTimer || mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return;
  }
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (mongoose.connection.readyState !== 1 && mongoose.connection.readyState !== 2) {
      console.log('[MongoDB] Auto-reconnecting to database...');
      try {
        await connectDB(3, 3000);
      } catch (err) {
        console.warn(`[MongoDB] Auto-reconnect failed: ${err.message}. Will try again...`);
      }
    }
  }, delay);
};

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB] Disconnected. Waiting for auto-reconnect...');
  cached.conn = null;
  cached.promise = null;
  scheduleReconnect(5000);
});

mongoose.connection.on('reconnected', () => {
  console.log('[MongoDB] Reconnected successfully.');
});

const connectDB = async (retries = 5, retryDelay = 4000) => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  const mongoURI = process.env.MONGO_URI;
  if (!mongoURI) {
    throw new Error('Please define the MONGO_URI environment variable inside backend/.env');
  }

  const opts = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    maxPoolSize: 25,
    family: 4, // Force IPv4 in MongoDB driver
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (!cached.promise || mongoose.connection.readyState === 0) {
        cached.promise = mongoose.connect(mongoURI, opts);
      }
      cached.conn = await cached.promise;
      return cached.conn;
    } catch (error) {
      cached.promise = null;
      cached.conn = null;
      console.error(`[MongoDB] Connection attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt < retries) {
        console.log(`[MongoDB] Retrying connection in ${retryDelay / 1000}s...`);
        await new Promise((res) => setTimeout(res, retryDelay));
      } else {
        scheduleReconnect(retryDelay);
        throw error;
      }
    }
  }
};

export default connectDB;
