import mongoose from 'mongoose';

// Global cache for serverless environments (Vercel)
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
      throw new Error('Please define the MONGO_URI environment variable inside .env');
    }

    cached.promise = mongoose.connect(mongoURI, opts).then((mongoose) => {
      console.log(`MongoDB Connected: ${mongoose.connection.host}`);
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    cached.promise = null;
    throw error; // Let the caller handle the error instead of crashing the process
  }
};

export default connectDB;
