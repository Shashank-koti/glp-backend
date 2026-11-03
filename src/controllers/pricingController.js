import PricingRequest from '../models/PricingRequest.js';
import Inquiry from '../models/Inquiry.js';
import ResponseFormatter from '../utils/ResponseFormatter.js';
import { sendFormNotificationEmail } from '../utils/emailService.js';

// @desc    Submit a new pricing or checkout request
// @route   POST /api/pricing
// @access  Public
export const submitPricingRequest = async (req, res, next) => {
  try {
    const {
      customerName,
      companyName,
      email,
      phone,
      country,
      message,
      role,
      poNumber,
      items,
      sourceForm,
    } = req.body;

    const determinedSourceForm = sourceForm || 'Product Details - Checkout Request Modal';

    const pricingReq = await PricingRequest.create({
      customerName,
      companyName,
      email,
      phone,
      country,
      message,
      role,
      poNumber,
      items,
      requestType: 'Pricing Request',
      sourceForm: determinedSourceForm,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Also mirror into Inquiry collection so CRM Inquiries dashboard displays it
    await Inquiry.create({
      customerName,
      companyName,
      email,
      phone,
      country,
      role,
      poNumber,
      items,
      productInterested: items?.map((i) => i.name).join(', ') || 'Pricing / Checkout Request',
      message: message || (poNumber ? `Checkout request with PO #${poNumber}` : 'Pricing Request'),
      inquiryType: 'Pricing Request',
      sourceForm: determinedSourceForm,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    }).catch((err) => console.error('[SYNC INQUIRY ERROR]', err.message));

    // Send email notification to info@glppharmastandards.com
    sendFormNotificationEmail({
      sourceForm: determinedSourceForm,
      inquiryType: 'Pricing Request',
      customerName,
      email,
      phone,
      companyName,
      country,
      role,
      poNumber,
      items,
      message,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    }).catch((err) => {
      console.error('[EMAIL NOTIFICATION ERROR]', err.message);
    });

    return ResponseFormatter.success(res, pricingReq, 'Pricing request submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};
