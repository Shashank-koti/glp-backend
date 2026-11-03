import multer from 'multer';

// Memory storage keeps file buffers in memory for flexible dispatching
// to Cloudinary or writing to local disk
const storage = multer.memoryStorage();

const allowedMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];

const fileFilter = (req, file, cb) => {
  const extValid = Boolean(file.originalname && file.originalname.match(/\.(pdf|doc|docx|png|jpe?g|webp|svg|gif)$/i));
  const mimeValid = allowedMimeTypes.includes(file.mimetype);

  if (extValid || mimeValid) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Invalid file type. Please upload a PDF, Word document (DOC/DOCX), or image file (PNG/JPG/WEBP/SVG).'
      ),
      false
    );
  }
};

export const documentUpload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max limit
  },
  fileFilter,
});

const handleMulterError = (err, res) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds maximum limit of 25MB.',
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed.',
    });
  }
};

/**
 * Single file upload middleware with error handling wrapper
 */
export const uploadSingleDocument = (fieldName = 'file') => {
  const upload = documentUpload.single(fieldName);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) return handleMulterError(err, res);
      next();
    });
  };
};

/**
 * Flexible upload middleware that accepts any of several field names and binds the file to req.file
 */
export const uploadSingleAny = (fieldNames = ['file', 'image', 'document', 'msds', 'coa', 'draftCoa']) => {
  const fields = fieldNames.map((name) => ({ name, maxCount: 1 }));
  const upload = documentUpload.fields(fields);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) return handleMulterError(err, res);
      if (req.files) {
        for (const name of fieldNames) {
          if (req.files[name] && req.files[name][0]) {
            req.file = req.files[name][0];
            break;
          }
        }
      }
      next();
    });
  };
};

/**
 * Image upload middleware that accepts either 'image' or 'file'
 */
export const uploadSingleImage = () => uploadSingleAny(['image', 'file']);

/**
 * Product multipart documents & image upload middleware
 * Accepts fields: 'msds', 'draftCoa', 'coa', 'file', 'image'
 */
export const uploadProductDocuments = (req, res, next) => {
  const upload = documentUpload.fields([
    { name: 'msds', maxCount: 1 },
    { name: 'draftCoa', maxCount: 1 },
    { name: 'coa', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ]);

  upload(req, res, (err) => {
    if (err) return handleMulterError(err, res);
    next();
  });
};

