import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SubProduct from '../src/models/SubProducts.js';
import { migrateCloudinaryDocumentToLocal, DOCUMENT_TYPES } from '../src/utils/documentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('[Error] No MONGO_URI or MONGODB_URI configured in .env');
  process.exit(1);
}

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected successfully.');

  // Find all subproducts that have documents with cloudinary URLs
  const query = {
    $or: [
      { 'documents.msds.url': /cloudinary\.com/i },
      { 'documents.draftCoa.url': /cloudinary\.com/i },
      { 'documents.coa.url': /cloudinary\.com/i },
    ],
  };

  const products = await SubProduct.find(query);
  console.log(`Found ${products.length} products with legacy Cloudinary documents.`);

  let migratedCount = 0;
  let errorCount = 0;

  for (const product of products) {
    for (const type of DOCUMENT_TYPES) {
      const doc = product.documents?.[type];
      if (doc && doc.url && doc.url.includes('cloudinary.com')) {
        try {
          console.log(`Migrating ${type.toUpperCase()} for "${product.name}" (${product.slug})...`);
          const res = await migrateCloudinaryDocumentToLocal({
            doc,
            docType: type,
            product,
          });
          console.log(`  -> Saved to VPS disk: ${res.relativeUrl} (${res.fileSize} bytes)`);
          migratedCount++;
        } catch (err) {
          console.error(`  -> Failed to migrate ${type} for "${product.name}":`, err.message);
          errorCount++;
        }
      }
    }
  }

  console.log('\n--- Migration Summary ---');
  console.log(`Total documents migrated: ${migratedCount}`);
  console.log(`Errors encountered: ${errorCount}`);

  await mongoose.disconnect();
  console.log('Finished.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
