import express from 'express';
import {
  crmGetCategories,
  crmGetCategoryById,
} from '../controllers/crmCategoryController.js';
import {
  crmGetMainProducts,
  crmCreateMainProduct,
} from '../controllers/crmProductController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Apply protection & admin role check to all routes
router.use(protect, admin);

// Read categories (Categories are predefined system divisions)
router.route('/')
  .get(crmGetCategories);

// Category-scoped main products:
// When clicking on a category (e.g. /api/crm/categories/Nitroso-Impurities/main-products or /api/crm/categories/2/main-products)
// - GET: shows all main products in that category
// - POST: creates a main product in that category (category is taken directly from req.params)
router.route('/:category/main-products')
  .get(crmGetMainProducts)
  .post(crmCreateMainProduct);

// Alias: /:category/products
router.route('/:category/products')
  .get(crmGetMainProducts)
  .post(crmCreateMainProduct);

// Read single category by ID or slug
router.route('/:id')
  .get(crmGetCategoryById);

export default router;
