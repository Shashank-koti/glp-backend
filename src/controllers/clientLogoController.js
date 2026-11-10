import ClientLogo from '../models/ClientLogo.js';

// @desc    Get all active client logos from MongoDB
// @route   GET /api/client-logos
// @access  Public
export const getClientLogos = async (req, res, next) => {
  try {
    const logos = await ClientLogo.find({ isActive: true })
      .sort({ order: 1 })
      .select('name image contentType order')
      .lean();

    // Cache header for 1 hour to optimize performance
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');

    return res.status(200).json({
      success: true,
      count: logos.length,
      data: logos,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get client logo binary image by ID
// @route   GET /api/client-logos/:id/image
// @access  Public
export const getClientLogoImage = async (req, res, next) => {
  try {
    const logo = await ClientLogo.findById(req.params.id);
    if (!logo || !logo.image) {
      return res.status(404).json({ success: false, message: 'Client logo not found.' });
    }

    // Extract base64 payload from data:image/...;base64,....
    const matches = logo.image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ success: false, message: 'Invalid image data format.' });
    }

    const contentType = matches[1] || logo.contentType || 'image/png';
    const imageBuffer = Buffer.from(matches[2], 'base64');

    res.set({
      'Content-Type': contentType,
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=86400, s-maxage=604800', // 1 day browser, 7 days CDN
    });

    return res.end(imageBuffer);
  } catch (error) {
    next(error);
  }
};
