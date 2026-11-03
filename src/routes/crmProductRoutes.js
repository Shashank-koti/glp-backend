import express from 'express';
import {
  crmGetProducts,
  crmGetProductById,
  crmCreateSubProduct,
  crmUpdateSubProduct,
  crmDeleteSubProduct,
  crmUploadProductDocument,
  crmDeleteProductDocument,
  crmUploadDocumentDirect,
  crmUploadImageDirect,
  crmGetCloudinaryStatus,
} from '../controllers/crmProductController.js';
import { protect, admin } from '../middlewares/authMiddleware.js';
import {
  uploadSingleDocument,
  uploadSingleImage,
  uploadSingleAny,
  uploadProductDocuments,
} from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// Apply protection & admin role check to all CRM product routes
router.use(protect, admin);

// Cloudinary storage connectivity diagnostic
router.get('/cloudinary-status', crmGetCloudinaryStatus);

// Standalone direct image upload for CRM (Chemical structure / product image)
router.post('/upload-image', uploadSingleAny(['image', 'file']), crmUploadImageDirect);

// Standalone direct document/file upload for CRM
router.post('/upload-document', uploadSingleAny(['file', 'document', 'msds', 'draftCoa', 'coa', 'image']), crmUploadDocumentDirect);

// Main SubProduct collection routes (supports JSON & multipart documents)
router.route('/')
  .get(crmGetProducts)
  .post(uploadProductDocuments, crmCreateSubProduct);

// Single SubProduct document management: POST (upload/update) & DELETE (remove)
router.route('/:id/documents/:docType')
  .post(uploadSingleAny(['file', 'document', 'msds', 'draftCoa', 'coa']), crmUploadProductDocument)
  .delete(crmDeleteProductDocument);

// Single SubProduct CRUD
router.route('/:id')
  .get(crmGetProductById)
  .put(uploadProductDocuments, crmUpdateSubProduct)
  .delete(crmDeleteSubProduct);

export default router;

