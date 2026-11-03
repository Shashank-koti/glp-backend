import jwt from 'jsonwebtoken';
import Client from '../models/Client.js';
import Admin from '../models/Admin.js';
import dotenv from 'dotenv';

dotenv.config();

// Middleware to protect routes for public/website clients
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key_123');

      // First check if it's a Client
      const client = await Client.findById(decoded.id).select('-password');
      if (client) {
        req.client = client;
        return next();
      }

      // Check if it's an Admin
      const adminUser = await Admin.findById(decoded.id).select('-password');
      if (adminUser) {
        if (!adminUser.isActive) {
          return res.status(403).json({ success: false, message: 'Admin account is deactivated' });
        }
        req.admin = adminUser;
        req.client = adminUser; // Backward compatibility
        return next();
      }

      return res.status(401).json({ success: false, message: 'Not authorized, account not found' });
    } catch (error) {
      console.error('Auth protect error:', error.message);
      return res.status(401).json({ success: false, message: 'Not authorized, invalid or expired token' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }
};

// Middleware specifically for CRM Admin routes
const protectAdmin = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key_123');

      const adminUser = await Admin.findById(decoded.id).select('-password');
      if (!adminUser) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Valid admin account required.',
        });
      }

      if (!adminUser.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Admin account has been deactivated.',
        });
      }

      req.admin = adminUser;
      req.client = adminUser; // Backward compatibility for routes referencing req.client
      return next();
    } catch (error) {
      console.error('Admin protect error:', error.message);
      return res.status(401).json({ success: false, message: 'Not authorized, invalid admin token' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no admin token provided' });
  }
};

// Role authorization guard for admin-only endpoints
const admin = (req, res, next) => {
  if (req.admin || (req.client && ['admin', 'superadmin', 'manager'].includes(req.client.role))) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Not authorized as an admin' });
};

export { protect, admin, protectAdmin };

