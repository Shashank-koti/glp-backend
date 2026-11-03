import express from 'express';
import { getUserLocation } from '../controllers/locationController.js';

const router = express.Router();

router.get('/', getUserLocation);

export default router;
