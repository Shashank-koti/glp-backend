import fs from 'fs';
import path from 'path';
import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary.js';

export { isCloudinaryConfigured };

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
 * Upload a document (PDF, DOC, DOCX) buffer directly to Cloudinary
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

  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured. Please ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set in .env.');
  }

  const normalized = normalizeDocType(docType) || 'doc';
  const cleanOriginalName = (file.originalname || `${normalized}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const extension = path.extname(cleanOriginalName) || '.pdf';
  const cleanIdentifier = String(identifier).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

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
        if (error) {
          console.error(`[Cloudinary Document Upload Error (${normalized})]:`, error);
          return reject(new Error(`Cloudinary document upload failed: ${error.message || error}`));
        }
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
    resourceType: uploadResult.resource_type || 'raw',
    uploadedAt: new Date(),
  };
};

/**
 * Upload an image buffer (chemical structure, product picture) directly to Cloudinary
 * The image name is set strictly to the impurity name (no random prefixes or timestamp suffixes)
 * @param {Object} params
 * @param {Express.Multer.File} params.file - Multer file object with buffer
 * @param {string} [params.identifier] - Impurity name or slug
 * @param {string} [params.name] - Impurity name
 * @param {Express.Request} [params.req] - Express request for constructing URLs
 * @returns {Promise<Object>} Image metadata object
 */
export const saveImageFile = async ({ file, identifier = 'product', name = '', req = null }) => {
  if (!file || !file.buffer) {
    throw new Error('No image file buffer provided for upload.');
  }

  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured. Please ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set in .env.');
  }

  // Use the exact impurity name as the image name on Cloudinary
  const rawName = String(name || identifier || file.originalname || 'impurity').trim();
  const nameWithoutExt = rawName.replace(/\.(png|jpe?g|webp|svg|gif)$/i, '').trim();
  // Strip characters that break Cloudinary URLs or create unwanted directory nesting (/ and \)
  const cleanImageName = nameWithoutExt.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'impurity';

  const uploadResult = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'GLP Pharma/subproducts-images',
        public_id: cleanImageName,
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary Upload Error]:', error);
          return reject(new Error(`Cloudinary upload failed: ${error.message || error}`));
        }
        resolve(result);
      }
    );
    stream.end(file.buffer);
  });

  console.log(`[Cloudinary] Successfully uploaded image "${cleanImageName}" to: ${uploadResult.secure_url}`);

  return {
    url: uploadResult.secure_url,
    fileName: file.originalname || cleanImageName,
    fileType: file.mimetype || 'image/png',
    fileSize: file.size,
    public_id: uploadResult.public_id,
    resourceType: 'image',
    uploadedAt: new Date(),
  };
};

/**
 * Extract Cloudinary public_id from a URL
 */
export const extractCloudinaryPublicId = (url) => {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return null;
  try {
    // URL pattern: .../upload/(transformations/)?(v12345/)?(public_id)(.ext)?
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;
    let pathPart = parts[1];

    // If there is a version segment (e.g. /v12345/ or v12345/), remove everything up to and including it
    if (/(?:^|\/)v\d+\//.test(pathPart)) {
      pathPart = pathPart.replace(/^.*?(?:^|\/)v\d+\//, '');
    } else {
      // If there are transformations before known folders:
      const folderMatch = pathPart.match(/(GLP(?:%20|\s)Pharma\/.*|glp_pharma\/.*)/i);
      if (folderMatch) {
        pathPart = folderMatch[1];
      }
    }

    // Remove file extension
    const extIndex = pathPart.lastIndexOf('.');
    if (extIndex > -1) {
      pathPart = pathPart.substring(0, extIndex);
    }
    return decodeURIComponent(pathPart).trim() || null;
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
 * @param {string} [fallbackName] - Impurity name for fallback public_id construction
 */
export const deleteImageFile = async (imageOrPublicId, fallbackName = '') => {
  if (!imageOrPublicId && !fallbackName) return;

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
  } else if (typeof imageOrPublicId === 'object' && imageOrPublicId !== null) {
    publicId = imageOrPublicId.public_id || extractCloudinaryPublicId(imageOrPublicId.url);
    url = imageOrPublicId.url;
  }

  // If publicId was not extracted from URL/object, but a fallback impurity name was provided
  if (!publicId && fallbackName) {
    const rawName = String(fallbackName).replace(/\.(png|jpe?g|webp|svg|gif)$/i, '').trim();
    const cleanImageName = rawName.replace(/[/\\?%*:|"<>]/g, '_').trim();
    if (cleanImageName) {
      publicId = `GLP Pharma/subproducts-images/${cleanImageName}`;
    }
  }

  if (publicId && isCloudinaryConfigured()) {
    try {
      console.log(`[Cloudinary] Deleting image from Cloudinary: "${publicId}"`);
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
      console.log(`[Cloudinary] Deletion result for "${publicId}":`, result);

      // If not found and a fallbackName exists, attempt deletion with direct impurity name in standard folder
      if (result?.result === 'not found' && fallbackName) {
        const rawName = String(fallbackName).replace(/\.(png|jpe?g|webp|svg|gif)$/i, '').trim();
        const altPublicId = `GLP Pharma/subproducts-images/${rawName.replace(/[/\\?%*:|"<>]/g, '_').trim()}`;
        if (altPublicId !== publicId) {
          console.log(`[Cloudinary] Attempting fallback deletion with: "${altPublicId}"`);
          const altResult = await cloudinary.uploader.destroy(altPublicId, { resource_type: 'image', invalidate: true });
          console.log(`[Cloudinary] Fallback deletion result:`, altResult);
        }
      }
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
