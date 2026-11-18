import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Product from '../models/Products.js';
import Category from '../models/Category.js';
import SubProduct from '../models/SubProducts.js';
import ResponseFormatter from '../utils/ResponseFormatter.js';
import ApiFeatures from '../utils/ApiFeatures.js';
import {
  DOCUMENT_TYPES,
  normalizeDocType,
  getDocTypeLabel,
  formatDocumentsForResponse,
  migrateCloudinaryDocumentToLocal,
  extractCloudinaryPublicId,
  isCloudinaryConfigured,
} from '../utils/documentService.js';
import cloudinary from '../config/cloudinary.js';
import slugGenerator from '../utils/slugGenerator.js';
import { resolveCategoryDoc } from './crmProductController.js';

// @desc    Get all products (with advanced search & filter)
// @route   GET /api/products
// @access  Public
export const getProducts = async (req, res, next) => {
  try {
    const searchFields = [
      'name',
      'specifications.casNumber',
      'specifications.alternateCas',
      'similarProducts',
      'specifications.catalogueNumber',
      'specifications.synonyms',
      'specifications.iupacName',
      'specifications.molecularFormula',
    ];

    // Add default active filter
    if (!req.query.isActive) {
      req.query.isActive = 'true';
    }

    if (!req.query.limit) {
      req.query.limit = '1000';
    }

    let baseFilter = {};
    if (req.query.category) {
      const resolvedCat = await resolveCategoryDoc(req.query.category);
      if (resolvedCat) {
        const parentApisInCat = await Product.distinct('_id', {
          $or: [{ category: resolvedCat._id }, { category_id: resolvedCat.categoryId }],
        });
        baseFilter = {
          $or: [
            { category: resolvedCat._id },
            { category_id: resolvedCat.categoryId },
            { mainProduct: { $in: parentApisInCat } },
          ],
        };
      }
      delete req.query.category;
    }

    const features = new ApiFeatures(
      SubProduct.find(baseFilter)
        .populate('category', 'categoryName slug categoryId')
        .populate({
          path: 'mainProduct',
          select: 'heading p_link category category_id',
          populate: {
            path: 'category',
            select: 'categoryName slug categoryId'
          }
        }),
      req.query
    )
      .search(searchFields)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const subProducts = await features.query;

    // For counting total, we need a separate query without pagination
    const countFeatures = new ApiFeatures(SubProduct.find(baseFilter), req.query)
      .search(searchFields)
      .filter();
    const total = await countFeatures.query.countDocuments();

    // Map categories and documents to subproducts for frontend backward compatibility
    const formattedProducts = subProducts.map(sp => {
      const formatted = sp.toObject();
      const cat = sp.category || sp.mainProduct?.category;
      if (cat) {
        formatted.category = {
          _id: cat._id,
          categoryName: cat.categoryName,
          slug: cat.slug,
          categoryId: cat.categoryId || cat._id?.toString()
        };
      }
      const hostBase = `${req.protocol}://${req.get('host')}`;
      const toFull = (url) => (url && url.startsWith('/') && hostBase ? `${hostBase}${url}` : url);

      formatted.documents = sp.documents || { msds: null, draftCoa: null, coa: null };
      formatted.documentSummary = formatDocumentsForResponse(sp.documents, sp.slug || sp.p_link, req);
      formatted.hasMsds = Boolean(sp.documents?.msds?.url);
      formatted.hasDraftCoa = Boolean(sp.documents?.draftCoa?.url);
      formatted.hasCoa = Boolean(sp.documents?.coa?.url);
      formatted.msdsUrl = toFull(sp.documents?.msds?.url) || null;
      formatted.draftCoaUrl = toFull(sp.documents?.draftCoa?.url) || null;
      formatted.coaUrl = toFull(sp.documents?.coa?.url) || null;
      formatted.msdsPath = sp.documents?.msds?.url || null;
      formatted.draftCoaPath = sp.documents?.draftCoa?.url || null;
      formatted.coaPath = sp.documents?.coa?.url || null;
      return formatted;
    });

    return ResponseFormatter.successWithPagination(res, formattedProducts, {
      total,
      count: formattedProducts.length,
      page: parseInt(req.query.page) || 1,
    }, 'Products fetched successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get single product (impurity) by slug
// @route   GET /api/products/:slug
// @access  Public
export const getProductBySlug = async (req, res, next) => {
  try {
    const rawParam = (req.params.slug || '').trim();
    // Extract base CAS if param contains extra text or salt notation, e.g. "55290-66-9 (HCl salt)" -> "55290-66-9"
    const casMatch = rawParam.match(/\d{2,7}-\d{2}-\d/);
    const cleanCas = casMatch ? casMatch[0] : rawParam.split('(')[0].trim();

    const escapeRegex = (str) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const escapedRaw = escapeRegex(rawParam);
    const escapedClean = escapeRegex(cleanCas);

    const orConditions = [
      { slug: rawParam },
      { slug: cleanCas },
      { 'specifications.casNumber': rawParam },
      { 'specifications.casNumber': cleanCas },
      { 'specifications.alternateCas': rawParam },
      { 'specifications.alternateCas': cleanCas },
      { similarProducts: rawParam },
      { similarProducts: cleanCas },
    ];

    if (escapedClean) {
      orConditions.push(
        { 'specifications.casNumber': { $regex: `^${escapedClean}(\\s*\\(.*\\)|;.*)?$`, $options: 'i' } },
        { 'specifications.casNumber': { $regex: `(^|[;,\\s])${escapedClean}($|[;,\\s\\(])`, $options: 'i' } },
        { 'specifications.alternateCas': { $regex: `^${escapedClean}(\\s*\\(.*\\)|;.*)?$`, $options: 'i' } },
        { 'specifications.alternateCas': { $regex: `(^|[;,\\s])${escapedClean}($|[;,\\s\\(])`, $options: 'i' } },
        { similarProducts: { $regex: `^${escapedClean}(\\s*\\(.*\\)|;.*)?$`, $options: 'i' } },
        { similarProducts: { $regex: `(^|[;,\\s])${escapedClean}($|[;,\\s\\(])`, $options: 'i' } }
      );
    }

    if (escapedRaw && escapedRaw !== escapedClean) {
      orConditions.push(
        { 'specifications.casNumber': { $regex: `^${escapedRaw}$`, $options: 'i' } },
        { 'specifications.alternateCas': { $regex: `^${escapedRaw}$`, $options: 'i' } },
        { similarProducts: { $regex: `^${escapedRaw}$`, $options: 'i' } }
      );
    }

    const subProduct = await SubProduct.findOne({
      $or: orConditions,
      isActive: true
    })
      .populate('category', 'categoryName slug categoryId')
      .populate({
        path: 'mainProduct',
        populate: {
          path: 'category',
          select: 'categoryName slug categoryId'
        }
      });

    if (!subProduct) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Format the response to be backward compatible with frontend
    const formattedSubProduct = subProduct.toObject();

    // Lift specifications up to the root level for easy frontend access
    if (formattedSubProduct.specifications) {
      Object.assign(formattedSubProduct, formattedSubProduct.specifications);
    }

    // Look up category for breadcrumbs (prioritize subProduct's category, then mainProduct's category)
    const cat = subProduct.category || subProduct.mainProduct?.category;
    if (cat) {
      formattedSubProduct.category = {
        _id: cat._id,
        categoryName: cat.categoryName,
        slug: cat.slug,
        categoryId: cat.categoryId || cat._id?.toString()
      };
    } else if (subProduct.mainProduct?.category_id) {
      const category = await Category.findOne({ categoryId: subProduct.mainProduct.category_id });
      if (category) {
        formattedSubProduct.category = {
          _id: category._id,
          categoryName: category.categoryName,
          slug: category.slug,
          categoryId: category.categoryId
        };
      }
    }

    // Attach documents and helper properties
    const hostBase = `${req.protocol}://${req.get('host')}`;
    const toFull = (url) => (url && url.startsWith('/') && hostBase ? `${hostBase}${url}` : url);

    formattedSubProduct.documents = subProduct.documents || { msds: null, draftCoa: null, coa: null };
    formattedSubProduct.documentSummary = formatDocumentsForResponse(subProduct.documents, subProduct.slug || subProduct.p_link, req);
    formattedSubProduct.hasMsds = Boolean(subProduct.documents?.msds?.url);
    formattedSubProduct.hasDraftCoa = Boolean(subProduct.documents?.draftCoa?.url);
    formattedSubProduct.hasCoa = Boolean(subProduct.documents?.coa?.url);
    formattedSubProduct.msdsUrl = toFull(subProduct.documents?.msds?.url) || null;
    formattedSubProduct.draftCoaUrl = toFull(subProduct.documents?.draftCoa?.url) || null;
    formattedSubProduct.coaUrl = toFull(subProduct.documents?.coa?.url) || null;
    formattedSubProduct.msdsPath = subProduct.documents?.msds?.url || null;
    formattedSubProduct.draftCoaPath = subProduct.documents?.draftCoa?.url || null;
    formattedSubProduct.coaPath = subProduct.documents?.coa?.url || null;

    return ResponseFormatter.success(res, formattedSubProduct, 'Product fetched successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get featured products
// @route   GET /api/products/special/featured
// @access  Public
export const getFeaturedProducts = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 8;
    const products = await Product.find({ isFeatured: true, isActive: true })
      .populate('category', 'categoryName slug')
      .limit(limit)
      .sort('-createdAt');

    return ResponseFormatter.success(res, products, 'Featured products fetched successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get latest products
// @route   GET /api/products/special/latest
// @access  Public
export const getLatestProducts = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 8;
    const products = await Product.find({ isActive: true })
      .populate('category', 'categoryName slug')
      .limit(limit)
      .sort('-createdAt');

    return ResponseFormatter.success(res, products, 'Latest products fetched successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get related products
// @route   GET /api/products/:slug/related
// @access  Public
export const getRelatedProducts = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 4;
    const currentProduct = await Product.findOne({ slug: req.params.slug });

    if (!currentProduct) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const relatedProducts = await Product.find({
      _id: { $ne: currentProduct._id },
      category: currentProduct.category,
      isActive: true,
    })
      .populate('category', 'categoryName slug')
      .limit(limit)
      .sort('-createdAt');

    return ResponseFormatter.success(res, relatedProducts, 'Related products fetched successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Increment product view count
// @route   POST /api/products/:slug/view
// @access  Public
export const incrementViewCount = async (req, res, next) => {
  try {
    const product = await Product.findOneAndUpdate(
      { slug: req.params.slug },
      { $inc: { viewsCount: 1 } },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    return ResponseFormatter.success(res, { viewsCount: product.viewsCount }, 'View count incremented');
  } catch (error) {
    next(error);
  }
};

// @desc    Get product filters options
// @route   GET /api/products/meta/filters
// @access  Public
export const getProductFilters = async (req, res, next) => {
  try {
    const categories = await Category.find({ status: true }).select('categoryName slug');
    const productTypes = await Product.distinct('productType', { isActive: true });

    // Could also get distinct purities, applications if needed

    return ResponseFormatter.success(res, {
      categories,
      productTypes,
    }, 'Filters fetched successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get unique product groups (subCategories) for a category
// @route   GET /api/products/groups/:categorySlug
// @access  Public
export const getProductGroupsByCategory = async (req, res, next) => {
  try {
    const category = await Category.findOne({ slug: req.params.categorySlug, status: true });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const { letter } = req.query;

    let matchQuery = { category: category._id, isActive: true, subCategory: { $exists: true, $ne: '' } };

    if (letter) {
      // Create a regex to match the starting letter (case-insensitive)
      matchQuery.subCategory = { $regex: new RegExp(`^${letter}`, 'i') };
    }

    // Using aggregation to get distinct subCategories and perhaps count them
    // Or we can just use distinct if we only need the names
    const groups = await Product.distinct('subCategory', matchQuery);

    // Sort alphabetically
    groups.sort((a, b) => a.localeCompare(b));

    return ResponseFormatter.success(res, groups, 'Product groups fetched successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get products by subCategory (group)
// @route   GET /api/products/subcategory/:subCategory
// @access  Public
export const getProductsBySubCategory = async (req, res, next) => {
  try {
    const subCategoryName = req.params.subCategory; // e.g. "nitroso-impurities"

    // 1. Look up the top-level Category
    const category = await Category.findOne({ slug: subCategoryName });
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // 2. Fetch the APIs (Main Products) that belong to this category OR contain impurities of this category
    const subProdMainIds = await SubProduct.distinct('mainProduct', {
      $or: [{ category: category._id }, { category_id: category.categoryId }],
      isActive: true
    });

    const categoryFilter = {
      $or: [
        { category: category._id },
        { category_id: category.categoryId },
        { _id: { $in: subProdMainIds } }
      ],
      status: true
    };

    const features = new ApiFeatures(
      Product.find(categoryFilter).populate('category', 'categoryName slug categoryId'),
      req.query
    )
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const products = await features.query;

    // 3. Attach the category object manually so the frontend code (like ProductsView.jsx) doesn't break
    const formattedProducts = products.map(p => {
      const prod = p.toObject();
      prod.category = {
        categoryName: category.categoryName,
        slug: category.slug,
        categoryId: category.categoryId
      };
      return prod;
    });

    const total = await Product.countDocuments(categoryFilter);

    return ResponseFormatter.successWithPagination(res, formattedProducts, {
      total,
      count: formattedProducts.length,
      page: parseInt(req.query.page) || 1,
    }, 'Products for subcategory fetched successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get subproducts (impurities) for a specific main product OR category
// @route   GET /api/products/:slug/subproducts
// @access  Public
export const getProductSubProducts = async (req, res, next) => {
  try {
    const slugParam = req.params.slug;

    // 1. Try to find the Main Product by slug
    let mainProduct = await Product.findOne({
      $or: [
        { p_link: slugParam },
        { p_link: slugParam.toLowerCase() },
        { p_link: slugGenerator(slugParam) },
        { heading: { $regex: new RegExp(`^${slugParam.replace(/[-_]+/g, ' ')}$`, 'i') } },
      ],
      status: true,
    }).populate('category');

    // 2. If no main product found, check if slugParam is a Category (e.g. Fine-Chemicals, Nitroso-Impurities, etc.)
    if (!mainProduct) {
      const categoryDoc = await resolveCategoryDoc(slugParam);
      if (categoryDoc) {
        const parentApis = await Product.find({
          $or: [{ category: categoryDoc._id }, { category_id: categoryDoc.categoryId }],
          status: true,
        });
        const parentApiIds = parentApis.map((p) => p._id);

        const filter = {
          $or: [
            { category: categoryDoc._id },
            { category_id: categoryDoc.categoryId },
            { mainProduct: { $in: parentApiIds } },
          ],
          isActive: true,
        };

        if (!req.query.limit) {
          req.query.limit = '1000';
        }

        const features = new ApiFeatures(
          SubProduct.find(filter)
            .populate('category', 'categoryName slug categoryId')
            .populate({
              path: 'mainProduct',
              select: 'heading p_link category category_id',
              populate: {
                path: 'category',
                select: 'categoryName slug categoryId',
              },
            }),
          req.query
        )
          .filter()
          .sort()
          .limitFields()
          .paginate();

        const subProducts = await features.query;
        const total = await SubProduct.countDocuments(filter);

        const formattedSubProducts = subProducts.map((sp) => {
          const formatted = sp.toObject();
          const cat = sp.category || sp.mainProduct?.category || categoryDoc;
          if (cat) {
            formatted.category = {
              _id: cat._id,
              categoryName: cat.categoryName,
              slug: cat.slug,
              categoryId: cat.categoryId || cat._id?.toString(),
            };
          }
          return formatted;
        });

        return ResponseFormatter.successWithPagination(
          res,
          formattedSubProducts,
          {
            total,
            count: formattedSubProducts.length,
            page: parseInt(req.query.page) || 1,
            mainProduct: {
              heading: categoryDoc.categoryName,
              slug: categoryDoc.slug,
            },
            category: {
              _id: categoryDoc._id,
              categoryName: categoryDoc.categoryName,
              slug: categoryDoc.slug,
              subtitle: categoryDoc.subtitle,
              description: categoryDoc.description,
            },
          },
          `SubProducts for category '${categoryDoc.categoryName}' fetched successfully`
        );
      }

      return res.status(404).json({ success: false, message: 'Main product or category not found' });
    }

    // 3. Main Product found - fetch the SubProducts that belong to this Main Product
    if (!req.query.limit) {
      req.query.limit = '1000';
    }

    const features = new ApiFeatures(
      SubProduct.find({ mainProduct: mainProduct._id, isActive: true })
        .populate('category', 'categoryName slug categoryId')
        .populate({
          path: 'mainProduct',
          select: 'heading p_link category category_id',
          populate: {
            path: 'category',
            select: 'categoryName slug categoryId',
          },
        }),
      req.query
    )
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const subProducts = await features.query;

    let category = mainProduct.category;
    if (!category && mainProduct.category_id) {
      category = await Category.findOne({ categoryId: mainProduct.category_id });
    }

    const formattedSubProducts = subProducts.map((sp) => {
      const formatted = sp.toObject();
      const cat = sp.category || category;
      if (cat) {
        formatted.category = {
          _id: cat._id,
          categoryName: cat.categoryName,
          slug: cat.slug,
          categoryId: cat.categoryId || cat._id?.toString(),
        };
      }
      return formatted;
    });

    const total = await SubProduct.countDocuments({ mainProduct: mainProduct._id, isActive: true });

    return ResponseFormatter.successWithPagination(
      res,
      formattedSubProducts,
      {
        total,
        count: formattedSubProducts.length,
        page: parseInt(req.query.page) || 1,
        mainProduct: {
          heading: mainProduct.heading,
          slug: mainProduct.p_link,
        },
        category: category
          ? {
            _id: category._id,
            categoryName: category.categoryName,
            slug: category.slug,
          }
          : null,
      },
      'SubProducts fetched successfully'
    );
  } catch (error) {
    next(error);
  }
};


export const testProduct = async (req, res, next) => {
  try {
    const subProducts = await SubProduct.findById("6ab2786c65e54c7230fda154").populate({ path: 'mainProduct', populate: { path: 'category' } });

    const formattedProducts = subProducts.map(sp => {
      const formatted = sp.toObject();
      if (sp.mainProduct && sp.mainProduct.category) {
        formatted.category = {
          categoryName: sp.mainProduct.category.categoryName,
          slug: sp.mainProduct.category.slug,
          categoryId: sp.mainProduct.category.categoryId || sp.mainProduct.category._id.toString()
        };
      }
      console.log(formatted);

      return formatted;
    });
    return res.status(200).json({ success: true, subProducts });
  } catch (error) {
    console.log(error);
  }
};

// ============================================================================
// DOCUMENT DOWNLOAD & RETRIEVAL CONTROLLERS (CLIENT/WEBSITE)
// ============================================================================

/**
 * Helper to construct robust product lookup condition
 * Matches slug, p_link, catalogueNumber, casNumber (exact or regex), alternateCas, or ObjectId
 */
const buildProductLookupConditions = (rawIdentifier) => {
  const rawParam = (rawIdentifier || '').trim();
  const casMatch = rawParam.match(/\d{2,7}-\d{2}-\d/);
  const cleanCas = casMatch ? casMatch[0] : rawParam.split('(')[0].trim();
  const escapeRegex = (str) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const escapedClean = escapeRegex(cleanCas);

  const orConditions = [
    { slug: rawParam },
    { slug: cleanCas },
    { p_link: rawParam },
    { 'specifications.catalogueNumber': rawParam },
    { 'specifications.casNumber': rawParam },
    { 'specifications.casNumber': cleanCas },
    { 'specifications.alternateCas': rawParam },
    { 'specifications.alternateCas': cleanCas },
    ...(mongoose.isValidObjectId(rawParam) ? [{ _id: rawParam }] : []),
  ];

  if (escapedClean) {
    orConditions.push(
      { 'specifications.casNumber': { $regex: `^${escapedClean}(\\s*\\(.*\\)|;.*)?$`, $options: 'i' } },
      { 'specifications.alternateCas': { $regex: `^${escapedClean}(\\s*\\(.*\\)|;.*)?$`, $options: 'i' } }
    );
  }

  return orConditions;
};

// @desc    Download a product document (MSDS, Draft COA, COA)
// @route   GET /api/products/:slug/download/:docType
// @route   GET /api/products/:slug/documents/:docType/download
// @access  Public
export const downloadProductDocument = async (req, res, next) => {
  try {
    const { slug, docType } = req.params;
    const normalizedType = normalizeDocType(docType);

    if (!normalizedType) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type requested. Valid types: msds, draft-coa, coa',
      });
    }

    // Look up SubProduct (by slug, CAS number, catalogue number, p_link, or ObjectId)
    const product = await SubProduct.findOne({
      $or: buildProductLookupConditions(slug),
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'SubProduct not found.' });
    }

    const doc = product.documents?.[normalizedType];
    const docLabel = getDocTypeLabel(normalizedType);
    const productName = product.name || product.heading;

    if (!doc || !doc.url) {
      return res.status(404).json({
        success: false,
        available: false,
        message: `${docLabel} is not currently available for ${productName}. Please request a quote or contact our technical team for assistance.`,
        docType: normalizedType,
        productName,
      });
    }

    const hostBase = `${req.protocol}://${req.get('host')}`;
    const toFull = (url) => (url && url.startsWith('/') && hostBase ? `${hostBase}${url}` : url);

    // If client requested JSON metadata
    if (
      req.query.format === 'json' ||
      req.query.json === 'true' ||
      req.headers.accept?.includes('application/json')
    ) {
      return res.status(200).json({
        success: true,
        available: true,
        data: {
          docType: normalizedType,
          docLabel,
          fileName: doc.fileName || `${product.slug || slug}-${normalizedType}.pdf`,
          url: toFull(doc.url),
          path: doc.url,
          storageType: doc.storageType || (doc.url.includes('cloudinary.com') ? 'cloudinary' : 'local'),
          fileType: doc.fileType || 'application/pdf',
          fileSize: doc.fileSize,
          uploadedAt: doc.uploadedAt,
          product: {
            id: product._id,
            name: productName,
            slug: product.slug || product.p_link,
          },
        },
      });
    }

    // Direct browser file download
    const cleanFileName = doc.fileName || `${product.slug || slug}-${normalizedType}.pdf`;

    // 1. VPS Server document storage (documents/coa, documents/msds, documents/draft-coa)
    if (doc.url && (doc.url.startsWith('/documents/') || doc.url.startsWith('/api/documents/'))) {
      const cleanRelative = doc.url.replace(/^\/?(api\/)?documents\//, '');
      const documentsBase = fs.existsSync(path.join(process.cwd(), 'backend', 'documents'))
        ? path.resolve(process.cwd(), 'backend', 'documents')
        : path.resolve(process.cwd(), 'documents');
      const localPath = path.resolve(documentsBase, cleanRelative);
      if (fs.existsSync(localPath)) {
        return res.download(localPath, cleanFileName);
      }
    }

    // 2. Direct localPath on product document
    if (doc.localPath && fs.existsSync(doc.localPath)) {
      return res.download(doc.localPath, cleanFileName);
    }

    // 3. Legacy public uploads
    if (doc.url && doc.url.startsWith('/public/uploads/')) {
      const relative = doc.url.replace(/^\/?public\//, '');
      const localPath = path.resolve(process.cwd(), 'public', relative);
      if (fs.existsSync(localPath)) {
        return res.download(localPath, cleanFileName);
      }
    }

    // 4. Remote Cloudinary file -> Automatically migrate to VPS documents folder and serve
    if (doc.url && doc.url.includes('cloudinary.com')) {
      try {
        const migrated = await migrateCloudinaryDocumentToLocal({
          doc,
          docType: normalizedType,
          product,
        });
        if (migrated && migrated.localPath && fs.existsSync(migrated.localPath)) {
          return res.download(migrated.localPath, cleanFileName);
        }
      } catch (migErr) {
        console.error('[Cloudinary Migration Error]:', migErr.message);
        // Fallback: If migration to local disk encountered an error, redirect to authenticated signed download URL
        const publicId = doc.public_id || extractCloudinaryPublicId(doc.url);
        if (publicId && isCloudinaryConfigured()) {
          const isRaw = doc.resourceType === 'raw' || doc.url.includes('/raw/upload/');
          const signedUrl = cloudinary.utils.private_download_url(publicId, 'pdf', {
            resource_type: isRaw ? 'raw' : 'image',
            type: 'upload',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          });
          return res.redirect(signedUrl);
        }
      }
    }

    // 5. Generic remote file (CDN, external) -> redirect to download/view
    if (doc.url && (doc.url.startsWith('http://') || doc.url.startsWith('https://'))) {
      return res.redirect(doc.url);
    }

    return res.status(404).json({
      success: false,
      message: `${docLabel} file is registered in database but could not be located on server storage (${doc.url}).`,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get document status & download links for a product
// @route   GET /api/products/:slug/documents
// @access  Public
export const getProductDocuments = async (req, res, next) => {
  try {
    const { slug } = req.params;

    // Only subproducts contain documents
    const product = await SubProduct.findOne({
      $or: buildProductLookupConditions(slug),
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'SubProduct not found.' });
    }

    const formattedDocs = formatDocumentsForResponse(
      product.documents,
      product.slug || product.p_link,
      req
    );

    return ResponseFormatter.success(
      res,
      {
        product: {
          id: product._id,
          name: product.name || product.heading,
          slug: product.slug || product.p_link,
        },
        documents: formattedDocs,
      },
      'Product documents retrieved successfully.'
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Get single document details
// @route   GET /api/products/:slug/documents/:docType
// @access  Public
export const getProductDocumentByType = async (req, res, next) => {
  try {
    const { slug, docType } = req.params;
    const normalizedType = normalizeDocType(docType);

    if (!normalizedType) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Valid types: msds, draft-coa, coa',
      });
    }

    // Only subproducts contain documents
    const product = await SubProduct.findOne({
      $or: buildProductLookupConditions(slug),
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'SubProduct not found.' });
    }

    const doc = product.documents?.[normalizedType];
    const docLabel = getDocTypeLabel(normalizedType);
    const hasDoc = Boolean(doc && doc.url);
    const hostBase = `${req.protocol}://${req.get('host')}`;
    const toFull = (url) => (url && url.startsWith('/') && hostBase ? `${hostBase}${url}` : url);
    const downloadUrl = hasDoc
      ? `${hostBase}/api/products/${product.slug || product.p_link}/download/${docType}`
      : null;

    return ResponseFormatter.success(
      res,
      {
        available: hasDoc,
        type: normalizedType,
        label: docLabel,
        fileName: doc?.fileName || null,
        fileType: doc?.fileType || null,
        fileSize: doc?.fileSize || null,
        uploadedAt: doc?.uploadedAt || null,
        storageType: doc?.storageType || (doc?.url?.includes('cloudinary.com') ? 'cloudinary' : 'local'),
        path: doc?.url || null,
        url: toFull(doc?.url) || null,
        downloadUrl,
        product: {
          id: product._id,
          name: product.name || product.heading,
          slug: product.slug || product.p_link,
        },
      },
      `${docLabel} details fetched successfully.`
    );
  } catch (error) {
    next(error);
  }
};