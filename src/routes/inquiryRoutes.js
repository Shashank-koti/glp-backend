import express from 'express';
import { submitInquiry } from '../controllers/inquiryController.js';
import rateLimit from 'express-rate-limit';

import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Rate limiting specifically for inquiries to prevent spam
const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'development' ? 500 : 30,
  message: 'Too many inquiries sent from this IP, please try again after an hour',
});

// General public inquiry route
router.post('/', inquiryLimiter, submitInquiry);

// Protected Quick Enquiry route
router.post('/quick', protect, inquiryLimiter, submitInquiry);

export default router;
