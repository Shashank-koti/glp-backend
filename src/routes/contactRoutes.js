import express from 'express';
import { submitContactMessage, getContactInfo } from '../controllers/inquiryController.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'development' ? 500 : 20,
  message: 'Too many contact messages sent from this IP, please try again after an hour',
});

router.post('/', contactLimiter, submitContactMessage);
router.get('/info', getContactInfo);

export default router;
