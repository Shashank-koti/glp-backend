import dotenv from 'dotenv';
import connectDB from './src/config/database.js';
import app from './src/app.js';

// Load environment variables
dotenv.config();

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
