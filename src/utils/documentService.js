import fs from 'fs';
import path from 'path';
import cloudinary from '../config/cloudinary.js';

// Canonical document types
export const DOCUMENT_TYPES = ['msds', 'draftCoa', 'coa'];

/**
 * Normalize any user or route string into one of the 3 canonical document types
 * @param {string} rawType
 * @returns {'msds'|'draftCoa'|'coa'|null}
 */
export const normalizeDocType = (rawType) => {
  if (!rawType || typeof rawType !== 'string') return null;

  const cleaned = rawType.trim().toLowerCase().replace(/[\s\-_]+/g, '');

  if (cleaned === 'msds' || cleaned === 'sds') {
    return 'msds';
  }
  if (cleaned === 'draftcoa' || cleaned === 'draft' || cleaned === 'dcoa') {
    return 'draftCoa';
  }
  if (cleaned === 'coa') {
    return 'coa';
  }

  return null;
};

/**
 * Human-readable label for a document type
 * @param {'msds'|'draftCoa'|'coa'|string} docType
 * @returns {string}
 */
export const getDocTypeLabel = (docType) => {
  const normalized = normalizeDocType(docType);
  switch (normalized) {
    case 'msds':
      return 'Material Safety Data Sheet (MSDS)';
    case 'draftCoa':
      return 'Draft Certificate of Analysis (Draft COA)';
    case 'coa':
      return 'Certificate of Analysis (COA)';
    default:
      return 'Document';
  }
};

/**
 * Check if Cloudinary is realistically configured (not empty or dummy default values)
 */
export const isCloudinaryConfigured = () => {
  const { CLOUDINARY_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  if (CLOUDINARY_URL && CLOUDINARY_URL.startsWith('cloudinary://') && !CLOUDINARY_URL.includes('your_')) {
    return true;
  }

  if (
    CLOUDINARY_CLOUD_NAME &&
    CLOUDINARY_API_KEY &&
    CLOUDINARY_API_SECRET &&
    CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
    CLOUDINARY_API_KEY !== 'your_api_key' &&
    CLOUDINARY_API_SECRET !== 'your_api_secret'
  ) {
    return true;
  }

  return false;
};

/**
 * Upload a document (PDF, DOC, DOCX) buffer to Cloudinary with fallback to local disk
 * @param {Object} params
 * @param {Express.Multer.File} params.file - Multer file object with buffer
 * @param {string} params.docType - Canonical docType ('msds', 'draftCoa', 'coa')
 * @param {string} [params.identifier] - Product slug or ID for naming
 * @param {Express.Request} [params.req] - Express request for constructing URLs
 * @returns {Promise<Object>} Document metadata object
 */
export const saveDocumentFile = async ({ file, docType, identifier = 'product', req = null }) => {
  if (!file || !file.buffer) {
    throw new Error('No file buffer provided for document upload.');
  }

  const normalized = normalizeDocType(docType) || 'doc';
  const cleanOriginalName = (file.originalname || `${normalized}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const extension = path.extname(cleanOriginalName) || '.pdf';
  const baseName = path.basename(cleanOriginalName, extension);
  const cleanIdentifier = String(identifier).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

  // 1. Attempt Cloudinary upload if configured
  if (isCloudinaryConfigured()) {
    try {
      const publicId = `glp_doc_${cleanIdentifier}_${normalized}_${Date.now()}`;
      const uploadOptions = {
        folder: 'glp_pharma/documents',
        public_id: publicId,
        resource_type: 'auto',
      };

      if (file.mimetype === 'application/pdf' || extension.toLowerCase() === '.pdf') {
        uploadOptions.format = 'pdf';
      }

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        stream.end(file.buffer);
      });

      console.log(`[Cloudinary] Successfully uploaded ${normalized.toUpperCase()} to: ${uploadResult.secure_url}`);

      return {
        url: uploadResult.secure_url,
        fileName: file.originalname || cleanOriginalName,
        fileType: file.mimetype || 'application/pdf',
        fileSize: file.size,
        public_id: uploadResult.public_id,
        resourceType: uploadResult.resource_type || 'image',
        uploadedAt: new Date(),
      };
    } catch (err) {
      console.warn('⚠️ Cloudinary document upload failed, falling back to local storage:', err.message);
    }
  } else {
    console.warn('⚠️ Cloudinary is not configured. Saving document to local storage fallback. Configure CLOUDINARY_* in .env to store on Cloudinary.');
  }

  // 2. Local disk storage fallback
  const uploadDir = path.resolve(process.cwd(), 'public/uploads/documents');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const localFileName = `${normalized}_${Date.now()}_${baseName}${extension}`;
  const filePath = path.join(uploadDir, localFileName);

  fs.writeFileSync(filePath, file.buffer);

  // Generate URL path
  const relativeUrl = `/public/uploads/documents/${localFileName}`;

  return {
    url: relativeUrl,
    fileName: file.originalname || localFileName,
    fileType: file.mimetype || 'application/pdf',
    fileSize: file.size,
    localPath: filePath,
    resourceType: 'local',
    uploadedAt: new Date(),
  };
};

/**
 * Upload an image buffer (chemical structure, product picture) to Cloudinary with fallback to local disk
 * @param {Object} params
 * @param {Express.Multer.File} params.file - Multer file object with buffer
 * @param {string} [params.identifier] - Product slug or ID for naming
 * @param {Express.Request} [params.req] - Express request for constructing URLs
 * @returns {Promise<Object>} Image metadata object
 */
export const saveImageFile = async ({ file, identifier = 'product', req = null }) => {
  if (!file || !file.buffer) {
    throw new Error('No image file buffer provided for upload.');
  }

  const cleanOriginalName = (file.originalname || 'structure.png').replace(/[^a-zA-Z0-9._-]/g, '_');
  const extension = path.extname(cleanOriginalName) || '.png';
  const baseName = path.basename(cleanOriginalName, extension);
  const cleanIdentifier = String(identifier).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

  // 1. Attempt Cloudinary upload if configured
  if (isCloudinaryConfigured()) {
    try {
      const publicId = `glp_img_${cleanIdentifier}_${Date.now()}`;
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'glp_pharma/products',
            public_id: publicId,
            resource_type: 'image',
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        stream.end(file.buffer);
      });

      console.log(`[Cloudinary] Successfully uploaded image to: ${uploadResult.secure_url}`);

      return {
        url: uploadResult.secure_url,
        fileName: file.originalname || cleanOriginalName,
        fileType: file.mimetype || 'image/png',
        fileSize: file.size,
        public_id: uploadResult.public_id,
        resourceType: 'image',
        uploadedAt: new Date(),
      };
    } catch (err) {
      console.warn('⚠️ Cloudinary image upload failed, falling back to local storage:', err.message);
    }
  } else {
    console.warn('⚠️ Cloudinary is not configured. Saving image to local storage fallback. Configure CLOUDINARY_* in .env to store on Cloudinary.');
  }

  // 2. Local disk storage fallback
  const uploadDir = path.resolve(process.cwd(), 'public/uploads/images');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const localFileName = `img_${Date.now()}_${baseName}${extension}`;
  const filePath = path.join(uploadDir, localFileName);

  fs.writeFileSync(filePath, file.buffer);

  const relativeUrl = `/public/uploads/images/${localFileName}`;

  return {
    url: relativeUrl,
    fileName: file.originalname || localFileName,
    fileType: file.mimetype || 'image/png',
    fileSize: file.size,
    localPath: filePath,
    resourceType: 'local',
    uploadedAt: new Date(),
  };
};

/**
 * Extract Cloudinary public_id from a URL
 */
export const extractCloudinaryPublicId = (url) => {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return null;
  try {
    // URL pattern: .../upload/(v12345/)?(folder/subfolder/public_id)(.ext)?
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;
    let pathPart = parts[1];
    // Remove version segment v12345/ if present
    pathPart = pathPart.replace(/^v\d+\//, '');
    // Remove extension
    const extIndex = pathPart.lastIndexOf('.');
    if (extIndex > -1) {
      pathPart = pathPart.substring(0, extIndex);
    }
    return pathPart || null;
  } catch (e) {
    return null;
  }
};

/**
 * Delete a document file from Cloudinary or local disk
 * @param {Object} document - Document object containing url or public_id
 */
export const deleteDocumentFile = async (document) => {
  if (!document) return;

  // Protect sample seed files from accidental unlinking
  if (
    document.fileName?.startsWith('sample_') ||
    (typeof document.url === 'string' && document.url.includes('/sample_')) ||
    (typeof document.localPath === 'string' && path.basename(document.localPath).startsWith('sample_'))
  ) {
    return;
  }

  // Cloudinary deletion
  const publicId = document.public_id || extractCloudinaryPublicId(document.url);
  if (publicId && isCloudinaryConfigured()) {
    try {
      const resType = document.resourceType || document.resource_type || 'image';
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: resType });
      if (result?.result === 'not found') {
        // Fallback: try raw resource_type
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      }
    } catch (err) {
      console.warn('Failed to delete document from Cloudinary:', err.message);
    }
  }

  // Local disk deletion
  if (document.localPath && fs.existsSync(document.localPath)) {
    try {
      fs.unlinkSync(document.localPath);
    } catch (err) {
      console.warn('Failed to delete local document file:', err.message);
    }
  } else if (document.url && typeof document.url === 'string' && document.url.startsWith('/public/uploads/')) {
    try {
      const relative = document.url.replace(/^\/?public\//, '');
      const local = path.resolve(process.cwd(), 'public', relative);
      if (fs.existsSync(local)) {
        fs.unlinkSync(local);
      }
    } catch (err) {
      console.warn('Failed to delete local document via URL path:', err.message);
    }
  }
};

/**
 * Delete an image file from Cloudinary or local disk
 * @param {string|Object} imageOrPublicId - URL, public_id or image object
 */
export const deleteImageFile = async (imageOrPublicId) => {
  if (!imageOrPublicId) return;

  let publicId = null;
  let url = null;

  if (typeof imageOrPublicId === 'string') {
    if (imageOrPublicId.includes('cloudinary.com')) {
      url = imageOrPublicId;
      publicId = extractCloudinaryPublicId(imageOrPublicId);
    } else if (imageOrPublicId.startsWith('/public/uploads/')) {
      url = imageOrPublicId;
    } else {
      publicId = imageOrPublicId;
    }
  } else if (typeof imageOrPublicId === 'object') {
    publicId = imageOrPublicId.public_id || extractCloudinaryPublicId(imageOrPublicId.url);
    url = imageOrPublicId.url;
  }

  if (publicId && isCloudinaryConfigured()) {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (err) {
      console.warn('Failed to delete image from Cloudinary:', err.message);
    }
  }

  if (url && url.startsWith('/public/uploads/')) {
    try {
      const relative = url.replace(/^\/?public\//, '');
      const local = path.resolve(process.cwd(), 'public', relative);
      if (fs.existsSync(local)) {
        fs.unlinkSync(local);
      }
    } catch (err) {
      console.warn('Failed to delete local image file:', err.message);
    }
  }
};

/**
 * Normalize document input (handles string URL or object)
 * @param {string|Object} input
 * @param {string} docType
 * @returns {Object|null}
 */
export const normalizeDocumentPayload = (input, docType) => {
  if (!input) return null;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return {
      url: trimmed,
      fileName: path.basename(trimmed) || `${docType.toUpperCase()}.pdf`,
      fileType: 'application/pdf',
      uploadedAt: new Date(),
    };
  }

  if (typeof input === 'object' && input.url) {
    return {
      url: String(input.url).trim(),
      fileName: input.fileName ? String(input.fileName).trim() : path.basename(input.url) || `${docType.toUpperCase()}.pdf`,
      fileType: input.fileType ? String(input.fileType).trim() : 'application/pdf',
      fileSize: typeof input.fileSize === 'number' ? input.fileSize : undefined,
      public_id: input.public_id || undefined,
      uploadedAt: input.uploadedAt ? new Date(input.uploadedAt) : new Date(),
    };
  }

  return null;
};

/**
 * Format documents for client response with status flags and download URLs
 * @param {Object} documents
 * @param {string} productSlug
 * @param {Express.Request} [req]
 */
export const formatDocumentsForResponse = (documents = {}, productSlug = '', req = null) => {
  const hostBase = req ? `${req.protocol}://${req.get('host')}` : '';

  const formatItem = (item, typeKey, label) => {
    const hasDoc = Boolean(item && item.url);
    const downloadRoute = productSlug ? `/api/products/${productSlug}/download/${typeKey}` : null;
    const fullDownloadUrl = downloadRoute ? `${hostBase}${downloadRoute}` : null;

    let fullFileUrl = item?.url || null;
    if (fullFileUrl && fullFileUrl.startsWith('/public/') && hostBase) {
      fullFileUrl = `${hostBase}${fullFileUrl}`;
    }

    return {
      available: hasDoc,
      label,
      type: typeKey,
      fileName: item?.fileName || (hasDoc ? `${label}.pdf` : null),
      fileType: item?.fileType || 'application/pdf',
      fileSize: item?.fileSize || null,
      uploadedAt: item?.uploadedAt || null,
      url: fullFileUrl,
      downloadUrl: fullDownloadUrl,
    };
  };

  const msds = formatItem(documents?.msds, 'msds', 'MSDS');
  const draftCoa = formatItem(documents?.draftCoa, 'draft-coa', 'Draft COA');
  const coa = formatItem(documents?.coa, 'coa', 'COA');

  return {
    msds,
    draftCoa,
    coa,
    summary: {
      hasMsds: msds.available,
      hasDraftCoa: draftCoa.available,
      hasCoa: coa.available,
      totalAvailable: [msds.available, draftCoa.available, coa.available].filter(Boolean).length,
    },
  };
};
