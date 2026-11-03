import express from 'express';
import { crmLogin, crmGetMe, crmLogout } from '../controllers/crmAuthController.js';
import { protectAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/login', crmLogin);
router.get('/me', protectAdmin, crmGetMe);
router.post('/logout', protectAdmin, crmLogout);

export default router;

