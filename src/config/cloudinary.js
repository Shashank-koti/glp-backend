import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure backend/.env is loaded from the backend directory regardless of cwd
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
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

/**
 * Returns true if Cloudinary is configured with valid credentials
 */
export const isCloudinaryConfigured = () => {
  const conf = cloudinary.config();
  return Boolean(
    conf.cloud_name &&
    conf.api_key &&
    conf.api_secret &&
    conf.cloud_name !== 'your_cloud_name' &&
    conf.api_key !== 'your_api_key' &&
    conf.api_secret !== 'your_api_secret'
  );
};

export default cloudinary;
