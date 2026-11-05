import mongoose from 'mongoose';

// Global cache for serverless environments (Vercel)
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

// Connection lifecycle listeners to prevent unhandled EventEmitter errors
mongoose.connection.on('error', (err) => {
  console.error(`MongoDB connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Waiting for auto-reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected successfully.');
});

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
      throw new Error('Please define the MONGO_URI environment variable inside .env');
    }

    const opts = {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 50,
    };

    cached.promise = mongoose.connect(mongoURI, opts).then((mongooseInstance) => {
      console.log(`MongoDB Connected: ${mongooseInstance.connection.host}`);
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    cached.promise = null;
    throw error;
  }
};

export default connectDB;
