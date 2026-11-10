import express from 'express';
import { getClientLogos, getClientLogoImage } from '../controllers/clientLogoController.js';

const router = express.Router();

router.get('/', getClientLogos);
router.get('/:id/image', getClientLogoImage);

export default router;

