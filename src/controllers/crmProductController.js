import mongoose from 'mongoose';
import Product from '../models/Products.js';
import SubProduct from '../models/SubProducts.js';
import Category from '../models/Category.js';
import ApiFeatures from '../utils/ApiFeatures.js';
import ResponseFormatter from '../utils/ResponseFormatter.js';
import slugGenerator from '../utils/slugGenerator.js';
import {
  DOCUMENT_TYPES,
  normalizeDocType,
  getDocTypeLabel,
  saveDocumentFile,
  saveImageFile,
  deleteDocumentFile,
  deleteImageFile,
  extractCloudinaryPublicId,
  isCloudinaryConfigured,
  normalizeDocumentPayload,
  formatDocumentsForResponse,
} from '../utils/documentService.js';

// ============================================================================
// HELPER: Resolve & Process Documents Payload from JSON and/or Multipart Uploads
// ============================================================================
export const resolveDocumentsPayload = async (existingDocs = {}, req, productIdentifier = 'product') => {
  const current = existingDocs
    ? existingDocs.toObject
      ? existingDocs.toObject()
      : { ...existingDocs }
    : {};

  const result = {
    msds: current.msds || null,
    draftCoa: current.draftCoa || null,
    coa: current.coa || null,
  };

  // 1. Process req.body.documents (could be object or JSON string from multipart)
  let bodyDocs = req.body?.documents;
  if (typeof bodyDocs === 'string') {
    try {
      bodyDocs = JSON.parse(bodyDocs);
    } catch (e) {
      bodyDocs = null;
    }
  }

  if (bodyDocs && typeof bodyDocs === 'object') {
    if ('msds' in bodyDocs) {
      result.msds = normalizeDocumentPayload(bodyDocs.msds, 'msds');
    }
    if ('draftCoa' in bodyDocs) {
      result.draftCoa = normalizeDocumentPayload(bodyDocs.draftCoa, 'draftCoa');
    }
    if ('coa' in bodyDocs) {
      result.coa = normalizeDocumentPayload(bodyDocs.coa, 'coa');
    }
  }

  // 2. Process flat body fields for convenience in forms
  if (req.body?.msds !== undefined) {
    result.msds = normalizeDocumentPayload(req.body.msds, 'msds');
  }
  if (req.body?.msdsUrl !== undefined) {
    result.msds = normalizeDocumentPayload(req.body.msdsUrl, 'msds');
  }
  if (req.body?.draftCoa !== undefined) {
    result.draftCoa = normalizeDocumentPayload(req.body.draftCoa, 'draftCoa');
  }
  if (req.body?.draftCoaUrl !== undefined) {
    result.draftCoa = normalizeDocumentPayload(req.body.draftCoaUrl, 'draftCoa');
  }
  if (req.body?.coa !== undefined) {
    result.coa = normalizeDocumentPayload(req.body.coa, 'coa');
  }
  if (req.body?.coaUrl !== undefined) {
    result.coa = normalizeDocumentPayload(req.body.coaUrl, 'coa');
  }

  // 3. Process removal flags
  if (req.body?.removeMsds === true || req.body?.removeMsds === 'true') {
    if (result.msds) await deleteDocumentFile(result.msds);
    result.msds = null;
  }
  if (req.body?.removeDraftCoa === true || req.body?.removeDraftCoa === 'true') {
    if (result.draftCoa) await deleteDocumentFile(result.draftCoa);
    result.draftCoa = null;
  }
  if (req.body?.removeCoa === true || req.body?.removeCoa === 'true') {
    if (result.coa) await deleteDocumentFile(result.coa);
    result.coa = null;
  }

  // 4. Process multipart uploaded files (req.files or req.file)
  if (req.files) {
    if (req.files.msds && req.files.msds[0]) {
      if (result.msds) await deleteDocumentFile(result.msds);
      result.msds = await saveDocumentFile({
        file: req.files.msds[0],
        docType: 'msds',
        identifier: productIdentifier,
        req,
      });
    }
    if (req.files.draftCoa && req.files.draftCoa[0]) {
      if (result.draftCoa) await deleteDocumentFile(result.draftCoa);
      result.draftCoa = await saveDocumentFile({
        file: req.files.draftCoa[0],
        docType: 'draftCoa',
        identifier: productIdentifier,
        req,
      });
    }
    if (req.files.coa && req.files.coa[0]) {
      if (result.coa) await deleteDocumentFile(result.coa);
      result.coa = await saveDocumentFile({
        file: req.files.coa[0],
        docType: 'coa',
        identifier: productIdentifier,
        req,
      });
    }
    if (req.files.file && req.files.file[0] && req.body?.docType) {
      const normalized = normalizeDocType(req.body.docType);
      if (normalized) {
        if (result[normalized]) await deleteDocumentFile(result[normalized]);
        result[normalized] = await saveDocumentFile({
          file: req.files.file[0],
          docType: normalized,
          identifier: productIdentifier,
          req,
        });
      }
    }
  } else if (req.file && req.body?.docType) {
    const normalized = normalizeDocType(req.body.docType);
    if (normalized) {
      if (result[normalized]) await deleteDocumentFile(result[normalized]);
      result[normalized] = await saveDocumentFile({
        file: req.file,
        docType: normalized,
        identifier: productIdentifier,
        req,
      });
    }
  }

  return result;
};

// ============================================================================
// HELPER: Resolve Category from identifier (slug, categoryId, ObjectId, name)
// ============================================================================
export const resolveCategoryDoc = async (categoryIdentifier) => {
  if (!categoryIdentifier) return null;

  // 1. Direct MongoDB ObjectId match
  if (mongoose.isValidObjectId(categoryIdentifier)) {
    const doc = await Category.findById(categoryIdentifier);
    if (doc) return doc;
  }

  // 2. Slug & categoryId & name match (e.g. 'Nitroso-Impurities', 'nitroso-impurities', '2', 'NITROSO IMPURITIES')
  const cleanStr = String(categoryIdentifier).trim();
  const slugified = slugGenerator(cleanStr);
  const nameSpaced = cleanStr.replace(/[-_]+/g, ' ');

  const doc = await Category.findOne({
    $or: [
      { slug: cleanStr },
      { slug: slugified },
      { slug: { $regex: new RegExp(`^${cleanStr}$`, 'i') } },
      { slug: { $regex: new RegExp(`^${slugified}$`, 'i') } },
      { categoryId: cleanStr },
      { categoryName: { $regex: new RegExp(`^${nameSpaced}$`, 'i') } },
      { categoryName: { $regex: new RegExp(`^${cleanStr}$`, 'i') } },
    ],
  });

  return doc;
};

// ============================================================================
// MAIN PRODUCTS CRM CONTROLLERS (CRUD)
// ============================================================================

// @desc    Get all main products with pagination, search, and filtering
//          Supports category filtering via route params (:category) or query (?category=...)
// @route   GET /api/crm/main-products
// @route   GET /api/crm/categories/:category/main-products
// @access  Private/Admin
export const crmGetMainProducts = async (req, res, next) => {
  try {
    const searchFields = ['heading', 'p_link', 'content'];

    // Category can come from route params (e.g. /api/crm/categories/:category/main-products)
    // or query string (?category=...)
    const categoryParam =
      req.params.category ||
      req.params.categoryId ||
      req.params.slug ||
      req.query.category;

    let baseFilter = {};
    let resolvedCategory = null;

    if (categoryParam) {
      resolvedCategory = await resolveCategoryDoc(categoryParam);
      if (!resolvedCategory) {
        return res.status(404).json({
          success: false,
          message: `Category '${categoryParam}' not found.`,
        });
      }

      // Find all main products that either directly belong to this category,
      // OR have any subproduct belonging to this category
      const subProdMainIds = await SubProduct.distinct('mainProduct', {
        $or: [{ category: resolvedCategory._id }, { category_id: resolvedCategory.categoryId }],
      });

      baseFilter = {
        $or: [
          { category: resolvedCategory._id },
          { category_id: resolvedCategory.categoryId },
          { _id: { $in: subProdMainIds } },
        ],
      };
    }

    const queryForFeatures = { ...req.query };
    delete queryForFeatures.category;
    if (!queryForFeatures.sort) queryForFeatures.sort = 'createdAt';

    const features = new ApiFeatures(
      Product.find(baseFilter)
        .populate('category', 'categoryName slug categoryId description')
        .populate('subProducts'),
      queryForFeatures
    )
      .search(searchFields)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const products = await features.query;

    const countFeatures = new ApiFeatures(Product.find(baseFilter), queryForFeatures)
      .search(searchFields)
      .filter();
    const total = await countFeatures.query.countDocuments();

    return ResponseFormatter.successWithPagination(


      res,
      products,
      {
        total,
        pages: Math.ceil(total / (parseInt(req.query.limit, 10) || 10)) || 1,
        count: products.length,
        page: parseInt(req.query.page, 10) || 1,
        limit: parseInt(req.query.limit, 10) || 10,
        category: resolvedCategory
          ? {
            _id: resolvedCategory._id,
            categoryName: resolvedCategory.categoryName,
            slug: resolvedCategory.slug,
            categoryId: resolvedCategory.categoryId,
            description: resolvedCategory.description,
          }
          : undefined,
      },
      resolvedCategory
        ? `Main products for category '${resolvedCategory.categoryName}' fetched successfully.`
        : 'Main products fetched successfully.'
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Get single main product by ID
// @route   GET /api/crm/main-products/:id
// @access  Private/Admin
export const crmGetMainProductById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid main product ID.' });
    }

    const product = await Product.findById(req.params.id)
      .populate('category', 'categoryName slug categoryId description')
      .populate('subProducts');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Main product not found.' });
    }

    return ResponseFormatter.success(res, product, 'Main product fetched successfully.');
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new main product under a category
// @route   POST /api/crm/categories/:category/main-products
// @route   POST /api/crm/main-products
// @access  Private/Admin
export const crmCreateMainProduct = async (req, res, next) => {
  try {
    const {
      heading,
      p_link,
      category,
      content,
      displayOrder,
      status,
    } = req.body;

    if (!heading || !heading.trim()) {
      return res.status(400).json({ success: false, message: 'Product heading is required.' });
    }

    // Category should come from req.params (admin does not enter the category name),
    // with fallback to req.body.category if provided
    const categoryParam =
      req.params.category ||
      req.params.categoryId ||
      req.params.slug ||
      req.params.id ||
      category;

    if (!categoryParam) {
      return res.status(400).json({
        success: false,
        message: 'Category is required. Please provide it in route params (e.g., /api/crm/categories/:category/main-products).',
      });
    }

    // Resolve Category reference (supports slug like 'Nitroso-Impurities', categoryId like '2', ObjectId, or name)
    const categoryDoc = await resolveCategoryDoc(categoryParam);
    if (!categoryDoc) {
      return res.status(404).json({
        success: false,
        message: `Category '${categoryParam}' not found.`,
      });
    }

    // Check unique heading
    const existingHeading = await Product.findOne({
      heading: { $regex: new RegExp(`^${heading.trim()}$`, 'i') },
    });
    if (existingHeading) {
      return res.status(400).json({
        success: false,
        message: `Main product with heading '${heading}' already exists.`,
      });
    }

    // Determine unique p_link / slug
    let finalSlug = p_link?.trim() ? slugGenerator(p_link) : slugGenerator(heading);
    const existingSlug = await Product.findOne({ p_link: finalSlug });
    if (existingSlug) {
      finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
    }

    const newProduct = await Product.create({
      heading: heading.trim(),
      p_link: finalSlug,
      category: categoryDoc._id,
      category_id: categoryDoc.categoryId || categoryDoc._id.toString(),
      content,
      displayOrder: displayOrder !== undefined ? displayOrder : 0,
      status: status !== undefined ? status : true,
    });

    await newProduct.populate('category', 'categoryName slug categoryId description');

    return ResponseFormatter.success(res, newProduct, 'Main product created successfully.', 201);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a main product
// @route   PUT /api/crm/main-products/:id
// @access  Private/Admin
export const crmUpdateMainProduct = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid main product ID.' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Main product not found.' });
    }

    if (req.body.heading) {
      const trimmedHeading = req.body.heading.trim();
      const existingHeading = await Product.findOne({
        _id: { $ne: product._id },
        heading: { $regex: new RegExp(`^${trimmedHeading}$`, 'i') },
      });
      if (existingHeading) {
        return res.status(400).json({
          success: false,
          message: `Main product with heading '${req.body.heading}' already exists.`,
        });
      }
      product.heading = trimmedHeading;
      if (!req.body.p_link) {
        product.p_link = slugGenerator(trimmedHeading);
      }
    }

    if (req.body.p_link) {
      product.p_link = slugGenerator(req.body.p_link);
    }

    if (req.body.heading || req.body.p_link) {
      const existingSlug = await Product.findOne({
        _id: { $ne: product._id },
        p_link: product.p_link,
      });
      if (existingSlug) {
        product.p_link = `${product.p_link}-${Date.now().toString().slice(-4)}`;
      }
    }

    // Resolve Category reference if category is passed via req.params or req.body
    const categoryParam =
      req.params.category ||
      req.params.categoryId ||
      req.body.category;

    if (categoryParam) {
      const categoryDoc = await resolveCategoryDoc(categoryParam);
      if (!categoryDoc) {
        return res.status(404).json({
          success: false,
          message: `Category '${categoryParam}' not found.`,
        });
      }
      product.category = categoryDoc._id;
      product.category_id = categoryDoc.categoryId || categoryDoc._id.toString();
    }

    if (req.body.content !== undefined) product.content = req.body.content;
    if (req.body.displayOrder !== undefined) product.displayOrder = req.body.displayOrder;
    if (req.body.status !== undefined) product.status = req.body.status;

    await product.save();
    await product.populate('category', 'categoryName slug categoryId description');

    return ResponseFormatter.success(res, product, 'Main product updated successfully.');
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a main product and associated subproducts
// @route   DELETE /api/crm/main-products/:id
// @access  Private/Admin
export const crmDeleteMainProduct = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid main product ID.' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Main product not found.' });
    }

    // Clean up document files attached to this main product
    if (product.documents) {
      if (product.documents.msds) await deleteDocumentFile(product.documents.msds);
      if (product.documents.draftCoa) await deleteDocumentFile(product.documents.draftCoa);
      if (product.documents.coa) await deleteDocumentFile(product.documents.coa);
    }

    // Cascade delete any SubProducts that point to this Main Product
    const relatedSubs = await SubProduct.find({ mainProduct: product._id });
    for (const sub of relatedSubs) {
      if (sub.imagePublicId || (sub.image && sub.image.includes('cloudinary.com'))) {
        await deleteImageFile(sub.imagePublicId || sub.image, sub.name);
      }
      if (sub.documents) {
        if (sub.documents.msds) await deleteDocumentFile(sub.documents.msds);
        if (sub.documents.draftCoa) await deleteDocumentFile(sub.documents.draftCoa);
        if (sub.documents.coa) await deleteDocumentFile(sub.documents.coa);
      }
    }

    await SubProduct.deleteMany({ mainProduct: product._id });
    await Product.findByIdAndDelete(product._id);

    return ResponseFormatter.success(
      res,
      { id: product._id },
      'Main product and associated subproducts deleted successfully.'
    );
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// SUBPRODUCTS CRM CONTROLLERS (CRUD)
// ============================================================================

// @desc    Get all subproducts for CRM with pagination, search, and filtering
// @route   GET /api/crm/products
// @access  Private/Admin
export const crmGetProducts = async (req, res, next) => {
  try {
    const searchFields = [
      'name',
      'slug',
      'productType',
      'specifications.casNumber',
      'specifications.alternateCas',
      'similarProducts',
      'specifications.catalogueNumber',
      'specifications.synonyms',
      'specifications.iupacName',
      'specifications.molecularFormula',
    ];

    // Support category filtering via query or route params
    const categoryParam = req.query.category || req.params.category;
    let baseFilter = {};
    let resolvedCategory = null;

    if (categoryParam) {
      resolvedCategory = await resolveCategoryDoc(categoryParam);
      if (resolvedCategory) {
        const parentApisInCat = await Product.distinct('_id', {
          $or: [{ category: resolvedCategory._id }, { category_id: resolvedCategory.categoryId }],
        });
        baseFilter = {
          $or: [
            { category: resolvedCategory._id },
            { category_id: resolvedCategory.categoryId },
            {
              $and: [
                { category: { $in: [null, undefined] } },
                { mainProduct: { $in: parentApisInCat } },
              ],
            },
          ],
        };
      }
    }

    const queryForFeatures = { ...req.query };
    delete queryForFeatures.category;

    const features = new ApiFeatures(
      SubProduct.find(baseFilter)
        .populate('category', 'categoryName slug categoryId')
        .populate({
          path: 'mainProduct',
          select: 'heading p_link category category_id',
          populate: {
            path: 'category',
            select: 'categoryName slug categoryId',
          },
        }),
      queryForFeatures
    )
      .search(searchFields)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const subProducts = await features.query;

    const countFeatures = new ApiFeatures(SubProduct.find(baseFilter), queryForFeatures)
      .search(searchFields)
      .filter();
    const total = await countFeatures.query.countDocuments();

    const formattedProducts = subProducts.map((sp) => {
      const formatted = sp.toObject();
      const cat = sp.category || sp.mainProduct?.category;
      if (cat) {
        formatted.category = {
          _id: cat._id,
          category_name: cat.categoryName,
          categoryName: cat.categoryName,
          slug: cat.slug,
          category_id: cat.categoryId || cat._id?.toString(),
          categoryId: cat.categoryId || cat._id?.toString(),
        };
      }
      formatted.documents = sp.documents || { msds: null, draftCoa: null, coa: null };
      formatted.hasMsds = Boolean(sp.documents?.msds?.url);
      formatted.hasDraftCoa = Boolean(sp.documents?.draftCoa?.url);
      formatted.hasCoa = Boolean(sp.documents?.coa?.url);
      formatted.msdsUrl = sp.documents?.msds?.url || null;
      formatted.draftCoaUrl = sp.documents?.draftCoa?.url || null;
      formatted.coaUrl = sp.documents?.coa?.url || null;
      return formatted;
    });

    return ResponseFormatter.successWithPagination(
      res,
      formattedProducts,
      {
        total,
        pages: Math.ceil(total / (parseInt(req.query.limit, 10) || 10)) || 1,
        count: formattedProducts.length,
        page: parseInt(req.query.page, 10) || 1,
        limit: parseInt(req.query.limit, 10) || 10,
        category: resolvedCategory
          ? {
            _id: resolvedCategory._id,
            categoryName: resolvedCategory.categoryName,
            slug: resolvedCategory.slug,
            categoryId: resolvedCategory.categoryId,
          }
          : undefined,
      },
      resolvedCategory
        ? `Products for category '${resolvedCategory.categoryName}' fetched successfully.`
        : 'Products fetched successfully.'
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Get single subproduct by ID
// @route   GET /api/crm/products/:id
// @access  Private/Admin
export const crmGetProductById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID.' });
    }

    const subProduct = await SubProduct.findById(req.params.id)
      .populate('category', 'categoryName slug categoryId')
      .populate({
        path: 'mainProduct',
        select: 'heading p_link category category_id',
        populate: {
          path: 'category',
          select: 'categoryName slug categoryId',
        },
      });

    if (!subProduct) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const formatted = subProduct.toObject();
    const cat = subProduct.category || subProduct.mainProduct?.category;
    if (cat) {
      formatted.category = {
        _id: cat._id,
        category_name: cat.categoryName,
        categoryName: cat.categoryName,
        slug: cat.slug,
        category_id:
          cat.categoryId || cat._id?.toString(),
        categoryId:
          cat.categoryId || cat._id?.toString(),
      };
    }

    formatted.documents = subProduct.documents || { msds: null, draftCoa: null, coa: null };
    formatted.hasMsds = Boolean(subProduct.documents?.msds?.url);
    formatted.hasDraftCoa = Boolean(subProduct.documents?.draftCoa?.url);
    formatted.hasCoa = Boolean(subProduct.documents?.coa?.url);
    formatted.msdsUrl = subProduct.documents?.msds?.url || null;
    formatted.draftCoaUrl = subProduct.documents?.draftCoa?.url || null;
    formatted.coaUrl = subProduct.documents?.coa?.url || null;

    return ResponseFormatter.success(res, formatted, 'Product fetched successfully.');
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new subproduct (impurity)
// @route   POST /api/crm/products
// @access  Private/Admin
export const crmCreateSubProduct = async (req, res, next) => {
  try {
    const {
      name,
      slug,
      image,
      description,
      mainProduct,
      category,
      productType,
      specifications,
      pricingTiers,
      similarProducts,
      availability,
      isFeatured,
      isActive,
    } = req.body;

    // 1. Chemical & Impurity Identification
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Impurity standard name is required.' });
    }

    if (!mainProduct) {
      return res.status(400).json({ success: false, message: 'Main product (Parent API) is required.' });
    }

    if (!mongoose.isValidObjectId(mainProduct)) {
      return res.status(400).json({ success: false, message: 'Invalid main product ID.' });
    }

    const mainProductDoc = await Product.findById(mainProduct);
    if (!mainProductDoc) {
      return res.status(400).json({ success: false, message: 'Specified main product does not exist.' });
    }

    // Resolve impurity-specific category (fallback to parent API category if not provided)
    let subCategoryDoc = null;
    if (category) {
      subCategoryDoc = await resolveCategoryDoc(category);
    }
    if (!subCategoryDoc && (mainProductDoc.category || mainProductDoc.category_id)) {
      subCategoryDoc = await resolveCategoryDoc(mainProductDoc.category || mainProductDoc.category_id);
    }

    if (!subCategoryDoc) {
      return res.status(400).json({ success: false, message: 'Category destination is required.' });
    }

    if (!availability || !availability.trim()) {
      return res.status(400).json({ success: false, message: 'Commercial availability is required.' });
    }

    // 2. Technical & Chemical Specifications validation
    let specs = specifications;
    if (typeof specs === 'string') {
      try {
        specs = JSON.parse(specs);
      } catch (e) {
        specs = {};
      }
    }
    specs = specs || {};

    const requiredSpecs = [
      { key: 'casNumber', label: 'CAS Number' },
      { key: 'catalogueNumber', label: 'Catalogue Number' },
      { key: 'purity', label: 'Purity' },
      { key: 'molecularFormula', label: 'Molecular Formula' },
      { key: 'molecularWeight', label: 'Molecular Weight' },
      { key: 'appearance', label: 'Physical Appearance' },
      { key: 'storage', label: 'Storage Conditions' },
      { key: 'shippingConditions', label: 'Shipping Conditions' },
      { key: 'iupacName', label: 'IUPAC Chemical Name' },
    ];

    for (const specItem of requiredSpecs) {
      if (!specs[specItem.key] || !String(specs[specItem.key]).trim()) {
        return res.status(400).json({
          success: false,
          message: `${specItem.label} is required under Technical & Chemical Specifications.`,
        });
      }
    }

    // 3. Commercial Quantities & Pricing Tiers validation
    let tiers = pricingTiers;
    if (typeof tiers === 'string') {
      try {
        tiers = JSON.parse(tiers);
      } catch (e) {
        tiers = [];
      }
    }

    if (!Array.isArray(tiers) || tiers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one commercial pricing tier (Unit Size and Price) is required.',
      });
    }

    const validTiers = tiers
      .filter((t) => t && t.size && String(t.size).trim() && t.price !== undefined && t.price !== null && !isNaN(Number(t.price)) && Number(t.price) >= 0)
      .map((t) => ({
        size: String(t.size).trim(),
        price: Number(t.price),
        description: t.description ? String(t.description).trim() : '',
        isBestValue: Boolean(t.isBestValue),
      }));

    if (validTiers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Each commercial pricing tier must have a valid unit size and non-negative price.',
      });
    }

    let finalSlug = slug?.trim() ? slugGenerator(slug) : slugGenerator(name);
    const existingSlug = await SubProduct.findOne({ slug: finalSlug });
    if (existingSlug) {
      finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
    }

    const initialDocuments = await resolveDocumentsPayload({}, req, finalSlug);

    let finalImageUrl = image || '';
    let finalImagePublicId = null;

    if (req.files?.image && req.files.image[0]) {
      const impurityName = name?.trim() || finalSlug;
      const savedImg = await saveImageFile({
        file: req.files.image[0],
        identifier: impurityName,
        name: impurityName,
        req,
      });
      finalImageUrl = savedImg.url;
      finalImagePublicId = savedImg.public_id;
    } else if (finalImageUrl) {
      finalImagePublicId = req.body.imagePublicId || extractCloudinaryPublicId(finalImageUrl);
    }

    const subProduct = await SubProduct.create({
      name: name.trim(),
      slug: finalSlug,
      image: finalImageUrl,
      imagePublicId: finalImagePublicId,
      description,
      mainProduct: mainProductDoc._id,
      category: subCategoryDoc ? subCategoryDoc._id : undefined,
      category_id: subCategoryDoc ? subCategoryDoc.categoryId : undefined,
      productType,
      specifications: specs,
      pricingTiers: validTiers,
      similarProducts: similarProducts || [],
      availability: availability || 'In Stock',
      isFeatured: isFeatured !== undefined ? isFeatured : false,
      isActive: isActive !== undefined ? isActive : true,
      documents: initialDocuments,
    });

    await subProduct.populate([
      {
        path: 'mainProduct',
        select: 'heading p_link category category_id',
        populate: {
          path: 'category',
          select: 'categoryName slug categoryId',
        },
      },
      {
        path: 'category',
        select: 'categoryName slug categoryId',
      },
    ]);

    const formatted = subProduct.toObject();
    const cat = subProduct.category || subProduct.mainProduct?.category;
    if (cat) {
      formatted.category = {
        _id: cat._id,
        category_name: cat.categoryName,
        categoryName: cat.categoryName,
        slug: cat.slug,
        category_id:
          cat.categoryId || cat._id?.toString(),
        categoryId:
          cat.categoryId || cat._id?.toString(),
      };
    }

    formatted.documents = subProduct.documents || { msds: null, draftCoa: null, coa: null };
    formatted.hasMsds = Boolean(subProduct.documents?.msds?.url);
    formatted.hasDraftCoa = Boolean(subProduct.documents?.draftCoa?.url);
    formatted.hasCoa = Boolean(subProduct.documents?.coa?.url);
    formatted.msdsUrl = subProduct.documents?.msds?.url || null;
    formatted.draftCoaUrl = subProduct.documents?.draftCoa?.url || null;
    formatted.coaUrl = subProduct.documents?.coa?.url || null;

    return ResponseFormatter.success(res, formatted, 'SubProduct created successfully.', 201);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a subproduct
// @route   PUT /api/crm/products/:id
// @access  Private/Admin
export const crmUpdateSubProduct = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID.' });
    }

    const subProduct = await SubProduct.findById(req.params.id);
    if (!subProduct) {
      return res.status(404).json({ success: false, message: 'SubProduct not found.' });
    }

    if (req.body.mainProduct) {
      if (!mongoose.isValidObjectId(req.body.mainProduct)) {
        return res.status(400).json({ success: false, message: 'Invalid main product ID format.' });
      }
      const mainProductDoc = await Product.findById(req.body.mainProduct);
      if (!mainProductDoc) {
        return res.status(400).json({ success: false, message: 'Specified main product does not exist.' });
      }
      subProduct.mainProduct = mainProductDoc._id;
    }

    if (req.body.name !== undefined) {
      if (!req.body.name || !req.body.name.trim()) {
        return res.status(400).json({ success: false, message: 'Impurity name cannot be empty.' });
      }
      subProduct.name = req.body.name.trim();
      if (!req.body.slug) {
        subProduct.slug = slugGenerator(req.body.name);
      }
    }

    if (req.body.slug) {
      subProduct.slug = slugGenerator(req.body.slug);
    }

    if (req.body.name || req.body.slug) {
      const existingSlug = await SubProduct.findOne({
        _id: { $ne: subProduct._id },
        slug: subProduct.slug,
      });
      if (existingSlug) {
        subProduct.slug = `${subProduct.slug}-${Date.now().toString().slice(-4)}`;
      }
    }

    if (req.body.category !== undefined) {
      if (req.body.category) {
        const subCategoryDoc = await resolveCategoryDoc(req.body.category);
        if (subCategoryDoc) {
          subProduct.category = subCategoryDoc._id;
          subProduct.category_id = subCategoryDoc.categoryId;
        }
      } else {
        subProduct.category = undefined;
        subProduct.category_id = undefined;
      }
    }

    if (req.files?.image && req.files.image[0]) {
      const impurityName = (req.body.name && req.body.name.trim()) || subProduct.name || subProduct.slug;
      const savedImg = await saveImageFile({
        file: req.files.image[0],
        identifier: impurityName,
        name: impurityName,
        req,
      });
      if (subProduct.imagePublicId || (subProduct.image && subProduct.image.includes('cloudinary.com'))) {
        await deleteImageFile(subProduct.imagePublicId || subProduct.image, subProduct.name);
      }
      subProduct.image = savedImg.url;
      subProduct.imagePublicId = savedImg.public_id;
    } else if (req.body?.removeImage === true || req.body?.removeImage === 'true') {
      if (subProduct.imagePublicId || (subProduct.image && subProduct.image.includes('cloudinary.com'))) {
        await deleteImageFile(subProduct.imagePublicId || subProduct.image, subProduct.name);
      }
      subProduct.image = '';
      subProduct.imagePublicId = '';
    } else if (req.body.image !== undefined) {
      const newImg = req.body.image ? req.body.image.trim() : '';
      if (subProduct.image && subProduct.image !== newImg) {
        // Image was changed or cleared: delete old image from Cloudinary
        await deleteImageFile(subProduct.imagePublicId || subProduct.image, subProduct.name);
      }
      subProduct.image = newImg;
      subProduct.imagePublicId = newImg ? (req.body.imagePublicId || extractCloudinaryPublicId(newImg)) : '';
    }
    if (req.body.description !== undefined) subProduct.description = req.body.description;
    if (req.body.productType !== undefined) subProduct.productType = req.body.productType;

    if (req.body.specifications) {
      let updatedSpecs = req.body.specifications;
      if (typeof updatedSpecs === 'string') {
        try {
          updatedSpecs = JSON.parse(updatedSpecs);
        } catch (e) {
          updatedSpecs = {};
        }
      }
      const currentSpecs = subProduct.specifications ? subProduct.specifications.toObject() : {};
      subProduct.specifications = { ...currentSpecs, ...updatedSpecs };
    }

    if (req.body.pricingTiers !== undefined) {
      let updatedTiers = req.body.pricingTiers;
      if (typeof updatedTiers === 'string') {
        try {
          updatedTiers = JSON.parse(updatedTiers);
        } catch (e) {
          updatedTiers = [];
        }
      }
      if (Array.isArray(updatedTiers)) {
        const validUpdatedTiers = updatedTiers
          .filter((t) => t && t.size && String(t.size).trim() && t.price !== undefined && t.price !== null && !isNaN(Number(t.price)) && Number(t.price) >= 0)
          .map((t) => ({
            size: String(t.size).trim(),
            price: Number(t.price),
            description: t.description ? String(t.description).trim() : '',
            isBestValue: Boolean(t.isBestValue),
          }));

        if (validUpdatedTiers.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'At least one commercial pricing tier (Unit Size and non-negative Price) is required.',
          });
        }
        subProduct.pricingTiers = validUpdatedTiers;
      }
    }
    if (req.body.similarProducts !== undefined) subProduct.similarProducts = req.body.similarProducts;
    if (req.body.availability !== undefined) {
      if (!req.body.availability || !req.body.availability.trim()) {
        return res.status(400).json({ success: false, message: 'Commercial availability cannot be empty.' });
      }
      subProduct.availability = req.body.availability.trim();
    }
    if (req.body.isFeatured !== undefined) subProduct.isFeatured = req.body.isFeatured;
    if (req.body.isActive !== undefined) subProduct.isActive = req.body.isActive;

    // Handle documents update if provided
    if (
      req.body.documents !== undefined ||
      req.body.msds !== undefined ||
      req.body.msdsUrl !== undefined ||
      req.body.draftCoa !== undefined ||
      req.body.draftCoaUrl !== undefined ||
      req.body.coa !== undefined ||
      req.body.coaUrl !== undefined ||
      req.body.removeMsds !== undefined ||
      req.body.removeDraftCoa !== undefined ||
      req.body.removeCoa !== undefined ||
      req.files ||
      req.file
    ) {
      subProduct.documents = await resolveDocumentsPayload(subProduct.documents, req, subProduct.slug);
      subProduct.markModified('documents');
    }

    await subProduct.save();

    await subProduct.populate([
      {
        path: 'mainProduct',
        select: 'heading p_link category category_id',
        populate: {
          path: 'category',
          select: 'categoryName slug categoryId',
        },
      },
      {
        path: 'category',
        select: 'categoryName slug categoryId',
      },
    ]);

    const formatted = subProduct.toObject();
    const cat = subProduct.category || subProduct.mainProduct?.category;
    if (cat) {
      formatted.category = {
        _id: cat._id,
        category_name: cat.categoryName,
        categoryName: cat.categoryName,
        slug: cat.slug,
        category_id:
          cat.categoryId || cat._id?.toString(),
        categoryId:
          cat.categoryId || cat._id?.toString(),
      };
    }

    formatted.documents = subProduct.documents || { msds: null, draftCoa: null, coa: null };
    formatted.hasMsds = Boolean(subProduct.documents?.msds?.url);
    formatted.hasDraftCoa = Boolean(subProduct.documents?.draftCoa?.url);
    formatted.hasCoa = Boolean(subProduct.documents?.coa?.url);
    formatted.msdsUrl = subProduct.documents?.msds?.url || null;
    formatted.draftCoaUrl = subProduct.documents?.draftCoa?.url || null;
    formatted.coaUrl = subProduct.documents?.coa?.url || null;

    return ResponseFormatter.success(res, formatted, 'SubProduct updated successfully.');
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a subproduct
// @route   DELETE /api/crm/products/:id
// @access  Private/Admin
export const crmDeleteSubProduct = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID.' });
    }

    const subProduct = await SubProduct.findById(req.params.id);
    if (!subProduct) {
      return res.status(404).json({ success: false, message: 'SubProduct not found.' });
    }

    // Clean up document & image files attached to this subproduct from Cloudinary/disk
    if (subProduct.imagePublicId || (subProduct.image && subProduct.image.includes('cloudinary.com'))) {
      await deleteImageFile(subProduct.imagePublicId || subProduct.image, subProduct.name);
    }
    if (subProduct.documents) {
      if (subProduct.documents.msds) await deleteDocumentFile(subProduct.documents.msds);
      if (subProduct.documents.draftCoa) await deleteDocumentFile(subProduct.documents.draftCoa);
      if (subProduct.documents.coa) await deleteDocumentFile(subProduct.documents.coa);
    }

    await SubProduct.findByIdAndDelete(req.params.id);

    return ResponseFormatter.success(res, { id: req.params.id }, 'SubProduct deleted successfully.');
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// DEDICATED DOCUMENT CRM CONTROLLERS (MSDS, Draft COA, COA)
// ============================================================================

// @desc    Upload or update a document (MSDS, Draft COA, COA) for a SubProduct
// @route   POST /api/crm/products/:id/documents/:docType
// @access  Private/Admin
export const crmUploadProductDocument = async (req, res, next) => {
  try {
    const { id, docType } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID.' });
    }

    const normalizedType = normalizeDocType(docType);
    if (!normalizedType) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Allowed types: msds, draft-coa, coa',
      });
    }

    const subProduct = await SubProduct.findById(id);
    if (!subProduct) {
      return res.status(404).json({ success: false, message: 'SubProduct not found.' });
    }

    let savedDoc = null;

    if (req.file) {
      savedDoc = await saveDocumentFile({
        file: req.file,
        docType: normalizedType,
        identifier: subProduct.slug || id,
        req,
      });
    } else if (req.body && (req.body.url || req.body[normalizedType] || req.body[`${normalizedType}Url`])) {
      const urlCandidate = req.body.url || req.body[normalizedType] || req.body[`${normalizedType}Url`];
      savedDoc = normalizeDocumentPayload(
        typeof urlCandidate === 'object' ? urlCandidate : { url: urlCandidate, fileName: req.body.fileName },
        normalizedType
      );
    } else if (req.body && req.body.documents && req.body.documents[normalizedType]) {
      savedDoc = normalizeDocumentPayload(req.body.documents[normalizedType], normalizedType);
    }

    if (!savedDoc || !savedDoc.url) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a document file or valid document URL.',
      });
    }

    // Clean up previous file if replaced
    if (subProduct.documents && subProduct.documents[normalizedType]) {
      await deleteDocumentFile(subProduct.documents[normalizedType]);
    }

    if (!subProduct.documents) {
      subProduct.documents = { msds: null, draftCoa: null, coa: null };
    }
    subProduct.documents[normalizedType] = savedDoc;
    subProduct.markModified('documents');
    await subProduct.save();

    await subProduct.populate({
      path: 'mainProduct',
      select: 'heading p_link category category_id',
      populate: {
        path: 'category',
        select: 'categoryName slug categoryId',
      },
    });

    return ResponseFormatter.success(
      res,
      {
        product: subProduct,
        document: savedDoc,
        docType: normalizedType,
        docLabel: getDocTypeLabel(normalizedType),
      },
      `${getDocTypeLabel(normalizedType)} updated successfully for ${subProduct.name}.`
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a document (MSDS, Draft COA, COA) from a SubProduct
// @route   DELETE /api/crm/products/:id/documents/:docType
// @access  Private/Admin
export const crmDeleteProductDocument = async (req, res, next) => {
  try {
    const { id, docType } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID.' });
    }

    const normalizedType = normalizeDocType(docType);
    if (!normalizedType) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Allowed types: msds, draft-coa, coa',
      });
    }

    const subProduct = await SubProduct.findById(id);
    if (!subProduct) {
      return res.status(404).json({ success: false, message: 'SubProduct not found.' });
    }

    if (subProduct.documents && subProduct.documents[normalizedType]) {
      await deleteDocumentFile(subProduct.documents[normalizedType]);
      subProduct.documents[normalizedType] = null;
      subProduct.markModified('documents');
      await subProduct.save();
    }

    return ResponseFormatter.success(
      res,
      {
        documents: subProduct.documents,
        deletedDocType: normalizedType,
      },
      `${getDocTypeLabel(normalizedType)} removed successfully from ${subProduct.name}.`
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Check Cloudinary configuration status
// @route   GET /api/crm/products/cloudinary-status
// @access  Private/Admin
export const crmGetCloudinaryStatus = async (req, res, next) => {
  try {
    const configured = isCloudinaryConfigured();
    return ResponseFormatter.success(
      res,
      {
        configured,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || (process.env.CLOUDINARY_URL ? 'Connected via CLOUDINARY_URL' : null),
        folders: {
          images: 'glp_pharma/products',
          documents: 'glp_pharma/documents',
        },
      },
      configured
        ? 'Cloudinary is configured and active for images and documents.'
        : 'Cloudinary is not configured. Falling back to local storage.'
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Direct standalone image upload (chemical structure / product image)
// @route   POST /api/crm/products/upload-image
// @access  Private/Admin
export const crmUploadImageDirect = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file was uploaded.' });
    }

    const impurityName = req.body.name || req.body.identifier || req.file.originalname || 'impurity';
    const savedImage = await saveImageFile({
      file: req.file,
      identifier: impurityName,
      name: impurityName,
      req,
    });

    return ResponseFormatter.success(res, savedImage, 'Image uploaded successfully to Cloudinary.', 201);
  } catch (error) {
    next(error);
  }
};

// @desc    Direct standalone document upload (MSDS, COA, Draft COA or image)
// @route   POST /api/crm/products/upload-document
// @access  Private/Admin
export const crmUploadDocumentDirect = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file was uploaded.' });
    }

    // Check if the uploaded file is an image
    const isImage =
      req.file.mimetype.startsWith('image/') ||
      req.body.docType === 'image' ||
      /\.(png|jpe?g|webp|svg|gif)$/i.test(req.file.originalname);

    if (isImage) {
      const impurityName = req.body.name || req.body.identifier || req.file.originalname || 'impurity';
      const savedImage = await saveImageFile({
        file: req.file,
        identifier: impurityName,
        name: impurityName,
        req,
      });
      return ResponseFormatter.success(res, savedImage, 'Image uploaded successfully to Cloudinary.', 201);
    }

    const docType = normalizeDocType(req.body.docType) || 'doc';
    const savedDoc = await saveDocumentFile({
      file: req.file,
      docType,
      identifier: req.body.identifier || 'direct',
      req,
    });

    return ResponseFormatter.success(res, savedDoc, 'Document file uploaded successfully to Cloudinary.', 201);
  } catch (error) {
    next(error);
  }
};

// Aliases for route consistency
export const crmGetSubProducts = crmGetProducts;
export const crmGetSubProductById = crmGetProductById;

