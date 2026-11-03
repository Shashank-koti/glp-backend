import Category from '../models/Category.js';
import ApiFeatures from '../utils/ApiFeatures.js';
import ResponseFormatter from '../utils/ResponseFormatter.js';
import slugGenerator from '../utils/slugGenerator.js';
import { resolveCategoryDoc } from './crmProductController.js';

// ==========================================
// CRM CATEGORY CONTROLLERS (CREATE & READ ONLY)
// Categories are permanent and non-changeable
// ==========================================

// @desc    Get all categories for CRM (including inactive)
// @route   GET /api/crm/categories
// @access  Private/Admin
export const crmGetCategories = async (req, res, next) => {
  try {
    const searchFields = ['categoryName', 'slug', 'categoryId', 'description'];

    const queryObj = { ...req.query };
    if (!queryObj.limit) queryObj.limit = 100;
    if (!queryObj.sort) queryObj.sort = 'createdAt';

    const features = new ApiFeatures(Category.find(), queryObj)
      .search(searchFields)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const categories = await features.query;

    const countFeatures = new ApiFeatures(Category.find(), queryObj)
      .search(searchFields)
      .filter();
    const total = await countFeatures.query.countDocuments();

    return ResponseFormatter.successWithPagination(
      res,
      categories,
      {
        total,
        count: categories.length,
        page: parseInt(req.query.page) || 1,
      },
      'Categories fetched successfully.'
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Get single category by ID, slug, or categoryId
// @route   GET /api/crm/categories/:id
// @access  Private/Admin
export const crmGetCategoryById = async (req, res, next) => {
  try {
    const category = await resolveCategoryDoc(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    return ResponseFormatter.success(res, category, 'Category fetched successfully.');
  } catch (error) {
    next(error);
  }
};

// @desc    Create a category (Disabled - Categories are fixed system divisions)
// @route   POST /api/crm/categories
// @access  Private/Admin
export const crmCreateCategory = async (req, res, next) => {
  return res.status(405).json({
    success: false,
    message: 'Category creation is disabled. Categories are fixed system divisions.',
  });
};

