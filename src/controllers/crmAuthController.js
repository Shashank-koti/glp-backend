import Admin from '../models/Admin.js';
import { generateToken, generateRefreshToken } from '../utils/jwtUtils.js';
import ResponseFormatter from '../utils/ResponseFormatter.js';

// @desc    Admin login for CRM
// @route   POST /api/crm/auth/login
// @access  Public
export const crmLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const admin = await Admin.findOne({ email: normalizedEmail }).select('+password');

    if (!admin || !(await admin.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid admin email or password' });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Admin account has been deactivated. Please contact support.',
      });
    }

    const accessToken = generateToken(admin._id);
    const refreshToken = generateRefreshToken(admin._id);

    admin.jwtRefreshToken = refreshToken;
    admin.lastLogin = new Date();
    await admin.save();

    res.cookie('jwt_admin', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const adminData = {
      _id: admin._id,
      name: admin.name,
      clientName: admin.name, // Kept for backwards compatibility with CRM frontend components
      email: admin.email,
      role: admin.role,
      company: admin.company,
      permissions: admin.permissions,
      token: accessToken,
    };

    return ResponseFormatter.success(
      res,
      {
        ...adminData,
        user: adminData,
      },
      'Admin logged in successfully'
    );

  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged-in admin profile
// @route   GET /api/crm/auth/me
// @access  Private/Admin
export const crmGetMe = async (req, res, next) => {
  try {
    const currentAdmin = req.admin || req.client;
    if (!currentAdmin) {
      return res.status(401).json({ success: false, message: 'Admin profile not found' });
    }

    return ResponseFormatter.success(
      res,
      {
        _id: currentAdmin._id,
        name: currentAdmin.name || currentAdmin.clientName,
        clientName: currentAdmin.name || currentAdmin.clientName,
        email: currentAdmin.email,
        role: currentAdmin.role,
        company: currentAdmin.company,
        permissions: currentAdmin.permissions || ['all'],
      },
      'Admin profile fetched successfully'
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Logout admin / clear admin cookie
// @route   POST /api/crm/auth/logout
// @access  Private/Admin
export const crmLogout = async (req, res, next) => {
  try {
    const adminId = req.admin?._id || req.client?._id;
    if (adminId) {
      await Admin.findByIdAndUpdate(adminId, { jwtRefreshToken: '' });
    }

    res.cookie('jwt_admin', '', {
      httpOnly: true,
      expires: new Date(0),
    });

    return ResponseFormatter.success(res, null, 'Admin logged out successfully');
  } catch (error) {
    next(error);
  }
};

