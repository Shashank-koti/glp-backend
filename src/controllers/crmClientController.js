import Client from '../models/Client.js';
import Inquiry from '../models/Inquiry.js';
import ResponseFormatter from '../utils/ResponseFormatter.js';
import bcrypt from 'bcrypt';

// @desc    Get all clients for CRM (with pagination, search, status filter, and inquiry counts)
// @route   GET /api/crm/clients
// @access  Private/Admin
export const crmGetClients = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { search, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const query = {};

    // Filter by status if provided
    if (status && status !== 'all') {
      query.status = status;
    }

    // Search query matching name, company, email, phone, country
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { clientName: searchRegex },
        { company: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { country: searchRegex },
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [total, clients] = await Promise.all([
      Client.countDocuments(query),
      Client.find(query)
        .select('-password -jwtRefreshToken')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    // Aggregate inquiry count for the retrieved batch of clients by email
    const emails = clients.map((c) => c.email).filter(Boolean);
    const inquiryCounts = emails.length > 0
      ? await Inquiry.aggregate([
          { $match: { email: { $in: emails } } },
          { $group: { _id: '$email', count: { $sum: 1 } } },
        ])
      : [];

    const inquiryCountMap = {};
    inquiryCounts.forEach((item) => {
      inquiryCountMap[item._id] = item.count;
    });

    const clientsWithStats = clients.map((c) => ({
      ...c,
      inquiryCount: inquiryCountMap[c.email] || 0,
    }));

    return ResponseFormatter.successWithPagination(
      res,
      clientsWithStats,
      {
        total,
        page,
        pages: Math.ceil(total / limit) || 1,
        limit,
      },
      'Clients retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Get client by ID with their complete inquiry history
// @route   GET /api/crm/clients/:id
// @access  Private/Admin
export const crmGetClientById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = await Client.findById(id).select('-password -jwtRefreshToken').lean();

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    // Fetch all inquiries/quotes submitted by this client's email
    const inquiries = client.email
      ? await Inquiry.find({ email: client.email }).sort({ createdAt: -1 }).lean()
      : [];

    return ResponseFormatter.success(
      res,
      {
        ...client,
        inquiries,
        inquiryCount: inquiries.length,
      },
      'Client details fetched successfully'
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new client from CRM administration
// @route   POST /api/crm/clients
// @access  Private/Admin
export const crmCreateClient = async (req, res, next) => {
  try {
    const {
      clientName,
      company,
      email,
      phone,
      country,
      password,
      status = 'active',
      notes = '',
      role = 'user',
    } = req.body;

    if (!clientName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await Client.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A client with this email address already exists',
      });
    }

    const client = await Client.create({
      clientName: clientName.trim(),
      company: company ? company.trim() : '',
      email: normalizedEmail,
      phone: phone ? phone.trim() : '',
      country: country ? country.trim() : '',
      password,
      status,
      notes: notes ? notes.trim() : '',
      role,
    });

    const clientData = client.toObject();
    delete clientData.password;
    delete clientData.jwtRefreshToken;

    return ResponseFormatter.success(res, clientData, 'Client created successfully', 201);
  } catch (error) {
    next(error);
  }
};

// @desc    Update client information from CRM
// @route   PUT /api/crm/clients/:id
// @access  Private/Admin
export const crmUpdateClient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      clientName,
      company,
      email,
      phone,
      country,
      status,
      notes,
      role,
      password,
    } = req.body;

    const client = await Client.findById(id);
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    if (email && email.toLowerCase().trim() !== client.email) {
      const normalizedEmail = email.toLowerCase().trim();
      const duplicate = await Client.findOne({
        email: normalizedEmail,
        _id: { $ne: id },
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'Another client is already using this email address',
        });
      }
      client.email = normalizedEmail;
    }

    if (clientName !== undefined) client.clientName = clientName.trim();
    if (company !== undefined) client.company = company.trim();
    if (phone !== undefined) client.phone = phone.trim();
    if (country !== undefined) client.country = country.trim();
    if (status !== undefined) client.status = status;
    if (notes !== undefined) client.notes = notes.trim();
    if (role !== undefined) client.role = role;

    // Optional password update if admin resets client password
    if (password && password.trim().length >= 6) {
      client.password = password.trim();
    }

    await client.save();

    const updated = await Client.findById(id).select('-password -jwtRefreshToken').lean();

    return ResponseFormatter.success(res, updated, 'Client updated successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a client account
// @route   DELETE /api/crm/clients/:id
// @access  Private/Admin
export const crmDeleteClient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = await Client.findById(id);

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    await Client.findByIdAndDelete(id);

    return ResponseFormatter.success(res, { id }, 'Client deleted successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get client overview metrics & KPI stats
// @route   GET /api/crm/clients/stats
// @access  Private/Admin
export const crmGetClientStats = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalClients,
      activeClients,
      inactiveClients,
      newClientsLast30Days,
      recentClients,
    ] = await Promise.all([
      Client.countDocuments(),
      Client.countDocuments({ status: { $ne: 'inactive' } }),
      Client.countDocuments({ status: 'inactive' }),
      Client.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Client.find()
        .select('-password -jwtRefreshToken')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    // Count how many total inquiries exist across all registered clients
    const allClientEmails = await Client.distinct('email');
    const clientsWithInquiriesCount = allClientEmails.length > 0
      ? (
          await Inquiry.aggregate([
            { $match: { email: { $in: allClientEmails } } },
            { $group: { _id: '$email' } },
            { $count: 'total' },
          ])
        )[0]?.total || 0
      : 0;

    return ResponseFormatter.success(
      res,
      {
        totalClients,
        activeClients,
        inactiveClients,
        newClientsLast30Days,
        clientsWithInquiriesCount,
        recentClients,
      },
      'Client statistics retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};
