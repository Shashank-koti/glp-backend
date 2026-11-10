import mongoose from 'mongoose';

const clientLogoSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
    },
    // Stored directly in MongoDB as Base64 data URL (e.g. data:image/png;base64,...)
    image: {
      type: String,
      required: [true, 'Client image is required'],
    },
    contentType: {
      type: String,
      default: 'image/png',
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const ClientLogo = mongoose.model('ClientLogo', clientLogoSchema);

export default ClientLogo;

