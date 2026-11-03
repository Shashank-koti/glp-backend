import mongoose from 'mongoose';
import slugGenerator from '../utils/slugGenerator.js';

// Schema for Pricing Tiers
const pricingTierSchema = new mongoose.Schema({
  size: { type: String, required: true }, // e.g., "100 mg", "1 g", "1 kg"
  price: { type: Number, required: true },
  description: { type: String }, // e.g., "For initial testing"
  isBestValue: { type: Boolean, default: false },
});

// Schema for Technical Specifications
const specificationSchema = new mongoose.Schema({
  iupacName: { type: String, trim: true }, // For IUPAC Name
  catalogueNumber: { type: String, trim: true },
  casNumber: { type: String, trim: true, index: true },
  alternateCas: { type: [String], default: [] }, // Dedicated field for Alternate CAS
  synonyms: { type: String, trim: true },
  molecularFormula: { type: String, trim: true },
  molecularWeight: { type: String, trim: true },
  purity: { type: String, trim: true, default: '>98%' },
  appearance: { type: String, trim: true },
  storage: { type: String, trim: true },
  shippingConditions: { type: String, trim: true, default: 'Ambient' },
  countryOfOrigin: { type: String, trim: true, default: 'India' },
}, { _id: false });

// Schema for Product Compliance & Quality Documents (MSDS, Draft COA, COA)
const documentItemSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true },
    fileName: { type: String, trim: true },
    fileType: { type: String, trim: true, default: 'application/pdf' },
    fileSize: { type: Number },
    public_id: { type: String },
    resourceType: { type: String, default: 'image' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const productDocumentsSchema = new mongoose.Schema(
  {
    msds: { type: documentItemSchema, default: null },
    draftCoa: { type: documentItemSchema, default: null },
    coa: { type: documentItemSchema, default: null },
  },
  { _id: false }
);

const subProductSchema = new mongoose.Schema(
  {
    // 1. Core Information
    name: { type: String, required: [true, 'SubProduct name is required'], trim: true },
    slug: { type: String, unique: true, index: true },
    image: { type: String }, // URL from Cloudinary
    imagePublicId: { type: String }, // Public ID from Cloudinary
    description: { type: String },
    
    // 2. Reference to Main Product & Category Classification
    mainProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: [true, 'Main product is required'] },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', index: true },
    category_id: { type: String, index: true },
    productType: { type: String, trim: true },
    
    // 3. Technical Specifications (Nested)
    specifications: {
      type: specificationSchema,
      default: () => ({})
    },
    
    // 4. Pricing Tiers (Array)
    pricingTiers: [pricingTierSchema],
    
    // 5. Additional Details
    similarProducts: { type: [String], default: [] },
    
    // 6. Status & Metrics
    availability: { type: String, trim: true, default: 'In Stock' },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    viewsCount: { type: Number, default: 0 },

    // 7. Product Compliance & Analytical Documents
    documents: {
      type: productDocumentsSchema,
      default: () => ({ msds: null, draftCoa: null, coa: null }),
    },
  },
  {
    timestamps: true,
  }
);

// Middleware to auto-generate slug before saving
subProductSchema.pre('save', function () {
  if (!this.slug) {
    this.slug = slugGenerator(this.name);
  }
});

// Virtual helpers for document availability and direct URLs
subProductSchema.virtual('hasMsds').get(function () {
  return Boolean(this.documents?.msds?.url);
});
subProductSchema.virtual('hasDraftCoa').get(function () {
  return Boolean(this.documents?.draftCoa?.url);
});
subProductSchema.virtual('hasCoa').get(function () {
  return Boolean(this.documents?.coa?.url);
});
subProductSchema.virtual('msdsUrl').get(function () {
  return this.documents?.msds?.url || null;
});
subProductSchema.virtual('draftCoaUrl').get(function () {
  return this.documents?.draftCoa?.url || null;
});
subProductSchema.virtual('coaUrl').get(function () {
  return this.documents?.coa?.url || null;
});

// Ensure virtuals are included in JSON/Object conversions
subProductSchema.set('toJSON', { virtuals: true });
subProductSchema.set('toObject', { virtuals: true });

// Indexes for optimized searching
subProductSchema.index({ 
  name: 'text', 
  description: 'text', 
  'specifications.casNumber': 'text', 
});
subProductSchema.index({ mainProduct: 1, productType: 1 });

const SubProduct = mongoose.model('SubProduct', subProductSchema);

export default SubProduct;