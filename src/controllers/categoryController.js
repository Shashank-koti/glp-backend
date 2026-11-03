import Category from '../models/Category.js';
import Product from '../models/Products.js';
import SubProduct from '../models/SubProducts.js';
import ResponseFormatter from '../utils/ResponseFormatter.js';
import ApiFeatures from '../utils/ApiFeatures.js';
import { resolveCategoryDoc } from './crmProductController.js';

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
export const getCategories = async (req, res, next) => {
  try {
    const features = new ApiFeatures(Category.find({ status: true }), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const categories = await features.query;
    const total = await Category.countDocuments({ status: true });

    return ResponseFormatter.successWithPagination(res, categories, {
      total,
      count: categories.length,
      page: parseInt(req.query.page) || 1,
    }, 'Categories fetched successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get category details by slug
// @route   GET /api/categories/:slug
// @access  Public
export const getCategoryBySlug = async (req, res, next) => {
  try {
    const category = await resolveCategoryDoc(req.params.slug);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    return ResponseFormatter.success(res, category, 'Category fetched successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get products by category slug
// @route   GET /api/categories/:slug/products
// @access  Public
export const getCategoryProducts = async (req, res, next) => {
  try {
    const category = await resolveCategoryDoc(req.params.slug);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // Also include main products that have any SubProduct in this category
    const subProdMainIds = await SubProduct.distinct('mainProduct', {
      $or: [{ category: category._id }, { category_id: category.categoryId }],
      isActive: true,
    });

    const filter = {
      $or: [
        { category: category._id },
        { category_id: category.categoryId },
        { _id: { $in: subProdMainIds } },
      ],
      status: true
    };

    // Support alphabet filtering on the heading
    if (req.query.letter && req.query.letter !== 'All') {
      filter.heading = { $regex: new RegExp(`^${req.query.letter}`, 'i') };
    }

    // Default to a high limit if not paginating explicitly
    if (!req.query.limit) {
      req.query.limit = '1000';
    }

    const features = new ApiFeatures(
      Product.find(filter).populate('category', 'categoryName slug categoryId'),
      req.query
    )
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const products = await features.query;

    // Format products to include the top level category object so the frontend continues to work
    const formattedProducts = products.map(p => {
      const prod = p.toObject();
      prod.category = {
        categoryName: category.categoryName,
        slug: category.slug,
        categoryId: category.categoryId
      };
      return prod;
    });

    const total = await Product.countDocuments(filter);

    return ResponseFormatter.successWithPagination(res, formattedProducts, {
      total,
      count: formattedProducts.length,
      page: parseInt(req.query.page) || 1,
    }, 'Category products fetched successfully');
  } catch (error) {
    next(error);
  }
};
