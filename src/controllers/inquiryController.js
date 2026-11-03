import Inquiry from '../models/Inquiry.js';
import ContactMessage from '../models/ContactMessage.js';
import ResponseFormatter from '../utils/ResponseFormatter.js';
import { sendFormNotificationEmail } from '../utils/emailService.js';

// @desc    Submit a new product inquiry or quote request
// @route   POST /api/inquiries
// @access  Public
export const submitInquiry = async (req, res, next) => {
  try {
    const {
      customerName,
      fullName,
      name,
      companyName,
      email,
      phone,
      contactNumber,
      country,
      productInterested,
      productName,
      quantity,
      chemicalName,
      casNo,
      poNumber,
      message,
      inquiryType,
      sourceForm,
      role,
      items,
    } = req.body;

    const finalCustomerName = customerName || fullName || name || 'Anonymous Customer';
    const finalPhone = phone || contactNumber || '';
    const finalProductInterested = productInterested || productName || chemicalName || '';
    const finalInquiryType = inquiryType || (req.path?.includes('quick') ? 'Quick Enquiry' : 'Quote Request');

    // Differentiate sourceForm intelligently if not explicitly sent
    let determinedSourceForm = sourceForm;
    if (!determinedSourceForm) {
      if (finalInquiryType === 'quick' || finalInquiryType === 'Quick Enquiry' || req.path?.includes('quick')) {
        determinedSourceForm = 'Quick Enquiry Page';
      } else if (Array.isArray(items) && items.length > 1) {
        determinedSourceForm = 'Cart Page - Multi-Product Quote Request';
      } else if (finalInquiryType === 'Pricing Request' || finalInquiryType === 'Checkout Request' || poNumber) {
        determinedSourceForm = 'Product Details - Checkout Request Modal';
      } else {
        determinedSourceForm = 'Product Details - Quote Request Modal';
      }
    }

    const inquiry = await Inquiry.create({
      customerName: finalCustomerName,
      companyName: companyName || '',
      email,
      phone: finalPhone,
      country: country || '',
      productInterested: finalProductInterested,
      chemicalName: chemicalName || '',
      casNo: casNo || '',
      quantity: quantity || (items?.length ? `${items.length} item(s)` : ''),
      poNumber: poNumber || '',
      message: message || (chemicalName ? `Chemical: ${chemicalName}, CAS: ${casNo || 'N/A'}, Qty: ${quantity || 'N/A'}` : 'Quote Request'),
      inquiryType: finalInquiryType,
      sourceForm: determinedSourceForm,
      role: role || '',
      items: items || [],
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Asynchronously dispatch email notification to info@glppharmastandards.com
    sendFormNotificationEmail({
      sourceForm: determinedSourceForm,
      inquiryType: finalInquiryType,
      customerName: finalCustomerName,
      companyName,
      email,
      phone: finalPhone,
      country,
      role,
      poNumber,
      productInterested: finalProductInterested,
      chemicalName,
      casNo,
      quantity,
      items,
      message: inquiry.message,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    }).catch((err) => {
      console.error('[EMAIL NOTIFICATION ERROR]', err.message);
    });

    return ResponseFormatter.success(res, inquiry, 'Inquiry submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

// @desc    Submit general contact form
// @route   POST /api/contact
// @access  Public
export const submitContactMessage = async (req, res, next) => {
  try {
    const { name, email, phone, subject, message, companyName, sourceForm } = req.body;
    const determinedSourceForm = sourceForm || 'Contact Us Page';

    const contactMessage = await ContactMessage.create({
      name,
      email,
      phone: phone || '',
      companyName: companyName || '',
      subject,
      message,
      sourceForm: determinedSourceForm,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Also record in Inquiry collection so CRM dashboard lists all customer contacts uniformly
    await Inquiry.create({
      customerName: name,
      companyName: companyName || '',
      email,
      phone: phone || '',
      subject,
      productInterested: subject || 'General Contact Form Inquiry',
      message,
      inquiryType: 'Contact Form',
      sourceForm: determinedSourceForm,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    }).catch((err) => console.error('[SYNC INQUIRY ERROR]', err.message));

    // Send email notification to info@glppharmastandards.com
    sendFormNotificationEmail({
      sourceForm: determinedSourceForm,
      inquiryType: 'Contact Form',
      customerName: name,
      email,
      phone: phone || '',
      companyName: companyName || '',
      subject,
      message,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    }).catch((err) => {
      console.error('[EMAIL NOTIFICATION ERROR]', err.message);
    });

    return ResponseFormatter.success(res, contactMessage, 'Contact message submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

// @desc    Get company contact information
// @route   GET /api/contact/info
// @access  Public
export const getContactInfo = async (req, res, next) => {
  try {
    const info = {
      address: 'Plot No:1, Shakti Puram Phase-2, Prashanti Nagar, Industrial Estate(IE), Kukatpally, Hyderabad, Telangana State, India, PIN: 500072',
      phone: '+91 9866074638',
      email: 'info@glppharmastandards.com',
      googleMapLink: 'https://maps.google.com/?q=Plot+No:1,+Shakti+Puram+Phase-2,+Prashanti+Nagar,+Kukatpally,+Hyderabad',
    };

    return ResponseFormatter.success(res, info, 'Contact info fetched successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Get all inquiries for CRM (with search & filtering)
// @route   GET /api/crm/inquiries
// @access  Private/Admin
export const crmGetInquiries = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.inquiryType) query.inquiryType = req.query.inquiryType;
    if (req.query.sourceForm) query.sourceForm = req.query.sourceForm;
    if (req.query.search) {
      const s = req.query.search.trim();
      query.$or = [
        { customerName: { $regex: s, $options: 'i' } },
        { companyName: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { productInterested: { $regex: s, $options: 'i' } },
        { sourceForm: { $regex: s, $options: 'i' } },
        { poNumber: { $regex: s, $options: 'i' } },
      ];
    }

    const inquiries = await Inquiry.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await Inquiry.countDocuments(query);

    return ResponseFormatter.successWithPagination(
      res,
      inquiries,
      { total, count: inquiries.length, page, limit },
      'Inquiries fetched successfully'
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Update inquiry status
// @route   PUT /api/crm/inquiries/:id
// @access  Private/Admin
export const crmUpdateInquiryStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const inquiry = await Inquiry.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!inquiry) {
      return res.status(404).json({ success: false, message: 'Inquiry not found' });
    }
    return ResponseFormatter.success(res, inquiry, 'Inquiry updated successfully');
  } catch (error) {
    next(error);
  }
};
