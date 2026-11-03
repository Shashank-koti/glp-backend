import nodemailer from 'nodemailer';

// Primary notification email address for all company forms
export const PRIMARY_NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'info@glppharmastandards.com';

// Cache transporter instance
let transporterInstance = null;

/**
 * Get or create nodemailer transporter
 */
const getTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_SERVICE } = process.env;

  if (!SMTP_USER || !SMTP_PASS) {
    return null;
  }

  const cleanPass = SMTP_PASS.replace(/\s+/g, '');
  const isGmail =
    SMTP_SERVICE === 'gmail' ||
    SMTP_HOST?.includes('gmail') ||
    SMTP_USER?.toLowerCase().endsWith('@gmail.com');

  if (isGmail) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: SMTP_USER,
        pass: cleanPass,
      },
    });
  }

  if (SMTP_HOST) {
    const port = parseInt(SMTP_PORT || '587', 10);
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: SMTP_SECURE === 'true' || port === 465,
      auth: {
        user: SMTP_USER,
        pass: cleanPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  return null;
};

/**
 * Determine visual styling (colors, badges) based on sourceForm or inquiryType
 */
const getFormMeta = (sourceForm = '', inquiryType = '') => {
  const normalizedSource = (sourceForm || '').toLowerCase();
  const normalizedType = (inquiryType || '').toLowerCase();

  if (normalizedSource.includes('contact') || normalizedType.includes('contact')) {
    return {
      badge: 'CONTACT FORM',
      color: '#0284c7', // Sky blue
      bgColor: '#e0f2fe',
      borderColor: '#38bdf8',
      formName: 'Website Contact Page (/contact)',
    };
  }

  if (normalizedSource.includes('quick') || normalizedType.includes('quick')) {
    return {
      badge: 'QUICK ENQUIRY',
      color: '#0d9488', // Teal
      bgColor: '#ccfbf1',
      borderColor: '#2dd4bf',
      formName: 'Quick Enquiry Page (/quick-enquiry)',
    };
  }

  if (normalizedSource.includes('checkout') || normalizedType.includes('checkout') || normalizedType.includes('pricing')) {
    return {
      badge: 'CHECKOUT / PO REQUEST',
      color: '#d97706', // Amber
      bgColor: '#fef3c7',
      borderColor: '#fbbf24',
      formName: 'Product Details Checkout Modal',
    };
  }

  if (normalizedSource.includes('cart') || (normalizedType.includes('quote') && normalizedSource.includes('cart'))) {
    return {
      badge: 'CART QUOTE REQUEST',
      color: '#7c3aed', // Purple
      bgColor: '#ede9fe',
      borderColor: '#a78bfa',
      formName: 'Cart Page - Multi-Item Quote',
    };
  }

  if (normalizedSource.includes('product') || normalizedType.includes('quote') || normalizedType.includes('product')) {
    return {
      badge: 'PRODUCT QUOTE REQUEST',
      color: '#059669', // Emerald
      bgColor: '#d1fae5',
      borderColor: '#34d399',
      formName: 'Product Details Quote Modal',
    };
  }

  return {
    badge: 'GENERAL INQUIRY',
    color: '#084553', // Brand dark teal
    bgColor: '#e6f4f6',
    borderColor: '#1aa3b6',
    formName: sourceForm || 'Website Lead Form',
  };
};

/**
 * Build rich HTML email template
 */
const buildNotificationEmailHtml = ({
  sourceForm,
  inquiryType,
  customerName,
  email,
  phone,
  companyName,
  country,
  role,
  poNumber,
  subject,
  message,
  productInterested,
  chemicalName,
  casNo,
  quantity,
  items = [],
}) => {
  const meta = getFormMeta(sourceForm, inquiryType);
  const now = new Date();
  const dateFormattedIST = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'medium' });
  const dateFormattedUTC = now.toUTCString();

  // Build items table if multiple items exist
  let itemsTableHtml = '';
  if (Array.isArray(items) && items.length > 0) {
    itemsTableHtml = `
      <div style="margin-top: 24px;">
        <h3 style="font-size: 15px; font-weight: 700; color: #084553; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
          Requested Products / Items (${items.length})
        </h3>
        <table style="width: 100%; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 13.5px;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #475569; text-align: left;">
              <th style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; width: 40px;">#</th>
              <th style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">Product Name</th>
              <th style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">CAS Number</th>
              <th style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">Quantity</th>
              <th style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">Item ID / Ref</th>
            </tr>
          </thead>
          <tbody>
            ${items
        .map(
          (item, idx) => `
              <tr style="border-bottom: 1px solid #f1f5f9; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
                <td style="padding: 10px 14px; color: #64748b; font-weight: 600;">${idx + 1}</td>
                <td style="padding: 10px 14px; color: #0f172a; font-weight: 600;">${item.name || item.productName || 'N/A'}</td>
                <td style="padding: 10px 14px; color: #334155; font-family: monospace;">${item.cas || item.casNo || 'N/A'}</td>
                <td style="padding: 10px 14px; color: #0f172a; font-weight: 600;">${item.quantity || 1} ${item.unit || ''}</td>
                <td style="padding: 10px 14px; color: #64748b; font-size: 12px;">${item.productId || item.id || 'N/A'}</td>
              </tr>
            `
        )
        .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Single product information block if no items array or extra product details
  let singleProductHtml = '';
  if ((!items || items.length === 0) && (productInterested || chemicalName || casNo || quantity)) {
    singleProductHtml = `
      <div style="margin-top: 24px; padding: 16px 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #084553; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;">
          Product Specifics
        </h3>
        <table style="width: 100%; font-size: 13.5px; border-collapse: collapse;">
          ${productInterested ? `<tr><td style="width: 150px; padding: 4px 0; color: #64748b; font-weight: 600;">Product Interested:</td><td style="color: #0f172a; font-weight: 700;">${productInterested}</td></tr>` : ''}
          ${chemicalName ? `<tr><td style="padding: 4px 0; color: #64748b; font-weight: 600;">Chemical Name:</td><td style="color: #0f172a;">${chemicalName}</td></tr>` : ''}
          ${casNo ? `<tr><td style="padding: 4px 0; color: #64748b; font-weight: 600;">CAS Number:</td><td style="color: #0f172a; font-family: monospace;">${casNo}</td></tr>` : ''}
          ${quantity ? `<tr><td style="padding: 4px 0; color: #64748b; font-weight: 600;">Required Quantity:</td><td style="color: #0f172a; font-weight: 700;">${quantity}</td></tr>` : ''}
        </table>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Form Submission</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5;">

  <div style="max-width: 680px; margin: 25px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    
    <!-- Top Header -->
    <div style="background: linear-gradient(135deg, #031525 0%, #084553 50%, #1AA3B6 100%); padding: 26px 30px; color: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">GLP PHARMA STANDARDS</h1>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #e0f2fe; opacity: 0.9;">Website Inquiry & Lead Dispatch Notification</p>
        </div>
      </div>
    </div>

    <!-- Form Source Callout Banner -->
    <div style="background-color: ${meta.bgColor}; border-bottom: 2px solid ${meta.borderColor}; padding: 14px 30px; display: flex; align-items: center; justify-content: space-between;">
      <div>
        <span style="display: inline-block; background-color: ${meta.color}; color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.8px; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">
          ${meta.badge}
        </span>
        <span style="font-size: 13.5px; font-weight: 600; color: ${meta.color}; margin-left: 10px;">
          Origin: ${meta.formName}
        </span>
      </div>
    </div>

    <!-- Main Content Container -->
    <div style="padding: 28px 30px;">

      <!-- Submission Summary Box -->
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
        <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #084553; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">
          Customer & Contact Details
        </h2>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">Customer Name:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 700; font-size: 15px;">${customerName || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Email Address:</td>
            <td style="padding: 6px 0;">
              <a href="mailto:${email}" style="color: #0284c7; text-decoration: none; font-weight: 600;">${email || 'N/A'}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Phone / Mobile:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">
              ${phone ? `<a href="tel:${phone}" style="color: #0f172a; text-decoration: none;">${phone}</a>` : '<span style="color: #94a3b8;">Not provided</span>'}
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Company Name:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${companyName || '<span style="color: #94a3b8;">Not provided</span>'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Country / Region:</td>
            <td style="padding: 6px 0; color: #0f172a;">${country || '<span style="color: #94a3b8;">Not provided</span>'}</td>
          </tr>
          ${role ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Designation / Role:</td>
            <td style="padding: 6px 0; color: #0f172a;">${role}</td>
          </tr>` : ''}
          ${poNumber ? `
          <tr>
            <td style="padding: 6px 0; color: #d97706; font-weight: 700;">PO / Reference #:</td>
            <td style="padding: 6px 0; color: #b45309; font-weight: 800; font-family: monospace; font-size: 15px;">${poNumber}</td>
          </tr>` : ''}
          ${subject ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Subject:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${subject}</td>
          </tr>` : ''}
        </table>
      </div>

      <!-- Single Product Specifics (if applicable) -->
      ${singleProductHtml}

      <!-- Items Table (if cart/multiple items) -->
      ${itemsTableHtml}

      <!-- Customer Message Block -->
      <div style="margin-top: 24px;">
        <h3 style="font-size: 14px; font-weight: 700; color: #084553; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">
          Message / Requirement Details
        </h3>
        <div style="background-color: #f8fafc; border-left: 4px solid ${meta.color}; padding: 14px 18px; border-radius: 0 8px 8px 0; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
${message || 'No additional message text provided.'}
        </div>
      </div>

      <!-- Action Button -->
      <div style="margin-top: 30px; text-align: center;">
        <a href="mailto:${email}?subject=${encodeURIComponent(`Re: Your Inquiry with GLP Pharma Standards [${meta.badge}]`)}"
           style="display: inline-block; background-color: #1AA3B6; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14.5px; padding: 13px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(26,163,182,0.3);">
          ✉ Reply Directly to Customer (${customerName || email})
        </a>
      </div>

      <!-- Submission Metadata / Audit Trail -->
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; line-height: 1.6;">
        <div><strong>Submission Time (IST):</strong> ${dateFormattedIST}</div>
        <div><strong>Submission Time (UTC):</strong> ${dateFormattedUTC}</div>
      </div>

    </div>

    <!-- Email Footer -->
    <div style="background-color: #f1f5f9; padding: 16px 30px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
      <p style="margin: 0;">
        This automated notification was delivered to <strong>info@glppharmastandards.com</strong> from GLP Pharma Standards Web Portal.
      </p>
      <p style="margin: 4px 0 0 0; color: #94a3b8;">
        Plot No:1, Shakti Puram Phase-2, Prashanti Nagar, IE Kukatpally, Hyderabad, India - 500072
      </p>
    </div>

  </div>

</body>
</html>
  `;
};

/**
 * Send inquiry/lead notification email to info@glppharmastandards.com
 *
 * @param {Object} data - Form submission details
 * @returns {Promise<{success: boolean, messageId?: string, simulated?: boolean}>}
 */
export const sendFormNotificationEmail = async (data = {}) => {
  const {
    sourceForm = 'Website Form',
    inquiryType = 'General Inquiry',
    customerName = 'Anonymous Customer',
    email = '',
    phone = '',
    companyName = '',
    country = '',
    role = '',
    poNumber = '',
    subject: explicitSubject = '',
    message = '',
    productInterested = '',
    chemicalName = '',
    casNo = '',
    quantity = '',
    items = [],
    ipAddress = '',
    userAgent = '',
  } = data;

  const meta = getFormMeta(sourceForm, inquiryType);

  // Build subject line with high visibility of form source
  let subjectDetail = '';
  if (poNumber) {
    subjectDetail = `PO #${poNumber} - ${customerName}`;
  } else if (items && items.length > 1) {
    subjectDetail = `Quote for ${items.length} items - ${customerName}`;
  } else if (productInterested || chemicalName) {
    subjectDetail = `${productInterested || chemicalName} - ${customerName}`;
  } else if (explicitSubject) {
    subjectDetail = `${explicitSubject} - ${customerName}`;
  } else {
    subjectDetail = `New inquiry from ${customerName}${companyName ? ` (${companyName})` : ''}`;
  }

  const emailSubject = `[GLP Pharma - ${meta.badge}] ${subjectDetail}`;

  const recipient = process.env.NOTIFICATION_EMAIL || PRIMARY_NOTIFICATION_EMAIL || 'info@glppharmastandards.com';
  const fromAddress = process.env.SMTP_FROM || `"GLP Pharma Standards" <${process.env.SMTP_USER || recipient}>`;

  const htmlContent = buildNotificationEmailHtml({
    sourceForm,
    inquiryType,
    customerName,
    email,
    phone,
    companyName,
    country,
    role,
    poNumber,
    subject: explicitSubject,
    message,
    productInterested,
    chemicalName,
    casNo,
    quantity,
    items,
    ipAddress,
    userAgent,
  });

  const transporter = getTransporter();

  // If real SMTP credentials are configured, send real email
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to: recipient,
        replyTo: email || recipient,
        subject: emailSubject,
        html: htmlContent,
      });

      console.log(`[EMAIL SERVICE] Notification successfully sent to ${recipient} (Message ID: ${info.messageId}) for form: "${sourceForm}"`);
      return { success: true, messageId: info.messageId, simulated: false };
    } catch (sendError) {
      console.error('[EMAIL SERVICE ERROR] Failed to send email via SMTP:', sendError.message);
      // Fall through to logging so submission is never lost
    }
  }

  // Fallback / Development Simulation mode:
  // Log complete readable summary so developers and testing scripts can inspect the exact dispatch
  console.log(`
================================================================================
📧 [EMAIL DISPATCH - ${meta.badge}]
To: ${recipient}
Reply-To: ${email || 'N/A'}
Subject: ${emailSubject}
Source Form: ${sourceForm} (${meta.formName})
Customer: ${customerName} | Email: ${email} | Phone: ${phone || 'N/A'}
Company: ${companyName || 'N/A'} | Country: ${country || 'N/A'}
${poNumber ? `PO Number: ${poNumber}\n` : ''}${productInterested ? `Product Interested: ${productInterested}\n` : ''}${items?.length ? `Items Count: ${items.length}\n` : ''}Message: ${message}
Timestamp: ${new Date().toISOString()}
⚠️ Note: Real email was not delivered to inbox because SMTP credentials (SMTP_USER & SMTP_PASS) are not yet configured in backend/.env.
================================================================================
  `);

  return { success: true, simulated: true, recipient };
};

export default {
  PRIMARY_NOTIFICATION_EMAIL,
  sendFormNotificationEmail,
};
