# GLP Pharma Global Portal - Backend API

This is the backend REST API for the GLP Pharma Global Portal public website. It is built using Node.js, Express.js, and MongoDB.

## Features

- **Authentication**: JWT-based client registration, login, logout, and token refresh.
- **Products**: Advanced searching, filtering, sorting, and pagination for 1,500+ pharmaceutical products.
- **Categories**: Category listing and product association.
- **Inquiries & Contacts**: Forms for product inquiries, quote requests, and general contact messages, secured with rate limiting.
- **Client Dashboard**: Profile management, wishlists, and recently viewed products.
- **Analytics & SEO**: Basic analytics APIs for tracking views and downloads, and SEO helpers like dynamic sitemaps.
- **Security**: Secured with Helmet, CORS, Rate Limiting, Mongo Sanitize, and XSS Protection.

## Prerequisites

- Node.js (v18+ recommended)
- MongoDB

## Setup Instructions

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Environment Variables:**
   Rename `.env.example` to `.env` and fill in the required values:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGO_URI=mongodb://localhost:27017/glp-pharma
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRES_IN=7d
   JWT_REFRESH_SECRET=your_refresh_secret
   JWT_REFRESH_EXPIRES_IN=30d
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   FRONTEND_URL=http://localhost:3000
   ```

3. **Run the server:**
   ```bash
   # Development mode (requires nodemon, or use node --watch)
   npm run dev
   # or
   node --watch server.js
   
   # Production mode
   npm start
   ```

## Architecture

- **`src/app.js`**: Express application setup, middlewares, and route injection.
- **`src/server.js`**: Application entry point and database connection initialization.
- **`src/models/`**: Mongoose database schemas.
- **`src/controllers/`**: Request handling and business logic.
- **`src/routes/`**: Express routers connecting endpoints to controllers.
- **`src/middlewares/`**: Custom middlewares for auth, error handling, etc.
- **`src/utils/`**: Utility classes and functions (e.g., `ApiFeatures` for filtering/pagination).
