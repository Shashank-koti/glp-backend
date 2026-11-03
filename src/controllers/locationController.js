import ResponseFormatter from '../utils/ResponseFormatter.js';

// @desc    Get user location/country based on IP
// @route   GET /api/location
// @access  Public
export const getUserLocation = async (req, res, next) => {
  try {
    // Check for Vercel/Cloudflare geolocation headers first
    let country = req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'];

    if (country) {
      return ResponseFormatter.success(res, { country }, 'Location fetched successfully', 200);
    }

    // Fallback: Use external IP API if headers are missing (e.g., local dev or other hosting)
    let ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';

    // Clean up IPv6 loopback for local testing
    if (ip === '::1' || ip === '127.0.0.1') {
      // Defaulting to 'US' for local development so it doesn't hide the section.
      // Change to 'IN' temporarily if you want to test the hiding functionality locally!
      return ResponseFormatter.success(res, { country: 'IN', ip }, 'Location fetched successfully (Local Mock)', 200);
    }

    // Try fetching from public API
    try {
      const response = await fetch(`http://ip-api.com/json/${ip}`);
      const data = await response.json();
      if (data && data.countryCode) {
        country = data.countryCode;
      } else {
        country = 'UNKNOWN';
      }
    } catch (err) {
      console.error('Error fetching IP location from external API:', err.message);
      country = 'UNKNOWN';
    }

    return ResponseFormatter.success(res, { country, ip }, 'Location fetched successfully', 200);
  } catch (error) {
    next(error);
  }
};
