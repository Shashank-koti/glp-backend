import express from 'express';
import {
  crmGetMainProducts,
  crmGetMainProductById,
  crmCreateMainProduct,
  crmUpdateMainProduct,
  crmDeleteMainProduct,
} from '../controllers/crmProductController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Apply protection & admin role check to all routes
router.use(protect, admin);

router.route('/')
  .get(crmGetMainProducts)
  .post(crmCreateMainProduct);

// Category-scoped routes: /api/crm/main-products/category/:category
router.route('/category/:category')
  .get(crmGetMainProducts)
  .post(crmCreateMainProduct);

router.route('/:id')
  .get(crmGetMainProductById)
  .put(crmUpdateMainProduct)
  .delete(crmDeleteMainProduct);

export default router;
