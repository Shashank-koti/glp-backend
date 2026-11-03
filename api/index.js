import connectDB from '../src/config/database.js';
import app from '../src/app.js';

export default async function handler(req, res) {
    // Ensure the database connection is established before handling the request
    await connectDB();

    // Pass the request to the Express app
    return app(req, res);
}