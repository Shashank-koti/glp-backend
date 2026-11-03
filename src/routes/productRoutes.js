import express from 'express';
import {
  getProducts,
  getProductBySlug,
  getFeaturedProducts,
  getLatestProducts,
  getRelatedProducts,
  incrementViewCount,
  getProductFilters,
  getProductGroupsByCategory,
  getProductsBySubCategory,
  getProductSubProducts,
  downloadProductDocument,
  getProductDocuments,
  getProductDocumentByType,
  testProduct,
} from '../controllers/productController.js';

const router = express.Router();

// Meta and category filtering
router.get('/meta/filters', getProductFilters);
router.get('/groups/:categorySlug', getProductGroupsByCategory);
router.get('/subcategory/:subCategory', getProductsBySubCategory);
router.get('/special/featured', getFeaturedProducts);
router.get('/special/latest', getLatestProducts);

// Document download and inspection endpoints (Public/Client)
// Supports MSDS, Draft COA, and COA
router.get('/:slug/download/:docType', downloadProductDocument);
router.get('/:slug/documents/:docType/download', downloadProductDocument);
router.get('/:slug/documents', getProductDocuments);
router.get('/:slug/documents/:docType', getProductDocumentByType);

// General product routes
router.get('/', getProducts);
router.get('/:slug', getProductBySlug);
router.get('/:slug/subproducts', getProductSubProducts);
router.get('/:slug/related', getRelatedProducts);
router.post('/:slug/view', incrementViewCount);

export default router;
