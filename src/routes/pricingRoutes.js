import express from 'express';
import { submitPricingRequest } from '../controllers/pricingController.js';

const router = express.Router();

router.post('/', submitPricingRequest);

export default router;
