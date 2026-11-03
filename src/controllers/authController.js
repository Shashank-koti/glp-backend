import Client from '../models/Client.js';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwtUtils.js';
import ResponseFormatter from '../utils/ResponseFormatter.js';
// @desc    Register a new client
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const { clientName, company, email, phone, country, password } = req.body;
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    const clientExists = await Client.findOne({ email: normalizedEmail });

    if (clientExists) {
      return res.status(400).json({ success: false, message: 'Client already exists' });
    }

    const client = await Client.create({
      clientName: clientName?.trim(),
      company: company?.trim(),
      email: normalizedEmail,
      phone: phone?.trim(),
      country: country?.trim(),
      password,
    });

    if (client) {
      const accessToken = generateToken(client._id);
      const refreshToken = generateRefreshToken(client._id);

      client.jwtRefreshToken = refreshToken;
      await client.save();

      res.cookie('jwt', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      return ResponseFormatter.success(res, {
        _id: client._id,
        clientName: client.clientName,
        email: client.email,
        token: accessToken,
      }, 'Client registered successfully', 201);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid client data' });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Auth client & get token
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    const client = await Client.findOne({ email: normalizedEmail }).select('+password');

    if (client && (await client.matchPassword(password))) {
      const accessToken = generateToken(client._id);
      const refreshToken = generateRefreshToken(client._id);

      client.jwtRefreshToken = refreshToken;
      await client.save();

      res.cookie('jwt', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return ResponseFormatter.success(res, {
        _id: client._id,
        clientName: client.clientName,
        email: client.email,
        token: accessToken,
      }, 'Login successful');
    } else {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Logout client / clear cookie
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res, next) => {
  try {
    const client = await Client.findById(req.client._id);
    if (client) {
      client.jwtRefreshToken = '';
      await client.save();
    }

    res.cookie('jwt', '', {
      httpOnly: true,
      expires: new Date(0),
    });

    return ResponseFormatter.success(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
export const refresh = async (req, res, next) => {
  try {
    // If we use cookies for refresh token, we need cookie-parser (not installed),
    // Or we expect refresh token in body
    const refreshToken = req.body.refreshToken || (req.headers.cookie ? req.headers.cookie.split('jwt=')[1]?.split(';')[0] : null);

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Not authorized, no refresh token' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const client = await Client.findById(decoded.id);

    if (!client || client.jwtRefreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const accessToken = generateToken(client._id);

    return ResponseFormatter.success(res, { token: accessToken }, 'Token refreshed');
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

// @desc    Forgot Password (dummy implementation without email sending logic)
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const client = await Client.findOne({ email });

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    // In a real application, send reset email here

    return ResponseFormatter.success(res, null, 'Password reset instructions sent to email');
  } catch (error) {
    next(error);
  }
};

// @desc    Change Password
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = async (req, res, next) => {
  try {
    const client = await Client.findById(req.client._id).select('+password');
    const { currentPassword, newPassword } = req.body;

    if (!client.password) {
       return res.status(400).json({ success: false, message: 'Password is not set for this account. Please reset your password.' });
    }

    if (!(await client.matchPassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Incorrect current password' });
    }

    client.password = newPassword;
    await client.save();

    return ResponseFormatter.success(res, null, 'Password updated successfully');
  } catch (error) {
    next(error);
  }
};

