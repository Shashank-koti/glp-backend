import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import dotenv from 'dotenv';

import { errorHandler, notFound } from './middlewares/errorMiddleware.js';

import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import inquiryRoutes from './routes/inquiryRoutes.js';
import pricingRoutes from './routes/pricingRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import locationRoutes from './routes/locationRoutes.js';

import crmAuthRoutes from './routes/crmAuthRoutes.js';
import crmProductRoutes from './routes/crmProductRoutes.js';
import crmMainProductRoutes from './routes/crmMainProductRoutes.js';
import crmCategoryRoutes from './routes/crmCategoryRoutes.js';
import crmInquiryRoutes from './routes/crmInquiryRoutes.js';
import crmClientRoutes from './routes/crmClientRoutes.js';

dotenv.config();

const app = express();

// Security HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Enable CORS - allow all origins during development
app.use(cors({
  origin: true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again in 15 minutes'
});
app.use('/api', limiter);

// Body parser, reading data from body into req.body (increased to 5mb for rich product payloads)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Data sanitization against NoSQL query injection
app.use((req, res, next) => {
  if (req.body) req.body = mongoSanitize.sanitize(req.body);
  if (req.params) req.params = mongoSanitize.sanitize(req.params);
  if (req.query) {
    Object.defineProperty(req, 'query', {
      value: mongoSanitize.sanitize(req.query),
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  next();
});

// Data sanitization against XSS
app.use(xss());

// Development logging
if (process.env.NODE_ENV === 'development') {
  // app.use(morgan('dev'));
}

// Serve static files (documents, images, uploads)
const publicDir = path.resolve(process.cwd(), 'public');
app.use('/public', express.static(publicDir));
app.use('/uploads', express.static(path.join(publicDir, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/contact', contactRoutes);

// CRM Routes
app.use('/api/crm/auth', crmAuthRoutes);
app.use('/api/crm/products', crmProductRoutes);
app.use('/api/crm/main-products', crmMainProductRoutes);
app.use('/api/crm/categories', crmCategoryRoutes);
app.use('/api/crm/inquiries', crmInquiryRoutes);
app.use('/api/crm/clients', crmClientRoutes);

// Base Route
app.get('/', (req, res) => {
  res.send('GLP Pharma API is running...');
});

// Error handling middlewares
app.use(notFound);
app.use(errorHandler);

export default app;
