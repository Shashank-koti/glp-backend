import express from 'express';
import {
  register,
  login,
  logout,
  refresh,
  forgotPassword,
  changePassword,
} from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', protect, logout);
router.post('/refresh', refresh);
router.post('/forgot-password', forgotPassword);
router.put('/change-password', protect, changePassword);

export default router;
