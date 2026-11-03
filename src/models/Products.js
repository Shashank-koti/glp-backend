import mongoose from 'mongoose';
import slugGenerator from '../utils/slugGenerator.js';

const productSchema = new mongoose.Schema(
  {
    heading: {
      type: String,
      required: [true, 'Product heading is required'],
      unique: true,
      trim: true,
    },
    p_link: {
      type: String,
      unique: true,
      index: true,
    },
    content: {
      type: String,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    category_id: {
      type: String,
      index: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

productSchema.pre('save', function () {
  if (!this.p_link) {
    this.p_link = slugGenerator(this.heading);
  }
});

productSchema.virtual('subProducts', {
  ref: 'SubProduct',
  localField: '_id',
  foreignField: 'mainProduct',
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

const Product = mongoose.model('Product', productSchema);

export default Product;
