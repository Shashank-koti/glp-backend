import express from 'express';
import {
  getCategories,
  getCategoryBySlug,
  getCategoryProducts,
} from '../controllers/categoryController.js';

const router = express.Router();

router.get('/', getCategories);
router.get('/:slug', getCategoryBySlug);
router.get('/:slug/products', getCategoryProducts);

export default router;
