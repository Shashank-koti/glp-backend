import express from 'express';
import {
  crmGetClients,
  crmGetClientById,
  crmCreateClient,
  crmUpdateClient,
  crmDeleteClient,
  crmGetClientStats,
} from '../controllers/crmClientController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Apply protection & admin role check to all CRM client routes
router.use(protect, admin);

// Aggregate stats endpoint (must be before /:id)
router.get('/stats', crmGetClientStats);

// Collection routes (list & create)
router.route('/')
  .get(crmGetClients)
  .post(crmCreateClient);

// Individual client routes (get, update, delete)
router.route('/:id')
  .get(crmGetClientById)
  .put(crmUpdateClient)
  .delete(crmDeleteClient);

export default router;
