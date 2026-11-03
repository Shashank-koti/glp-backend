import express from 'express';
import { crmGetInquiries, crmUpdateInquiryStatus } from '../controllers/inquiryController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect, admin);

router.route('/')
  .get(crmGetInquiries);

router.route('/:id')
  .put(crmUpdateInquiryStatus);

export default router;
