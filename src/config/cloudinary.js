import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

const cloudinaryUrl = process.env.CLOUDINARY_URL;
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudinaryUrl && cloudinaryUrl.startsWith('cloudinary://') && !cloudinaryUrl.includes('your_')) {
  cloudinary.config({
    cloudinary_url: cloudinaryUrl,
    secure: true,
  });
} else if (
  cloudName &&
  apiKey &&
  apiSecret &&
  cloudName !== 'your_cloud_name' &&
  apiKey !== 'your_api_key' &&
  apiSecret !== 'your_api_secret'
) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

export default cloudinary;
