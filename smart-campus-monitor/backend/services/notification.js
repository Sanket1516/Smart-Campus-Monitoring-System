const nodemailer = require('nodemailer');
const { isHosteller } = require('../utils/studentMeta');
const { getEmailSenderName, shouldSendEntryExitEmail } = require('./configService');
const { composeParentEmail } = require('./emailTemplates');
const { enqueue: enqueueEmail } = require('./emailQueue');

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

const addressOf = (value) => String(value || '').match(/<([^>]+)>/)?.[1] || String(value || '').trim();

/**
 * Gmail/SES only deliver reliably when the From address is the authenticated account. A different
 * EMAIL_FROM address gets rewritten or spam-filtered, so the login address is used as the sender and
 * the configured address becomes Reply-To.
 */
const buildSender = (senderName, env = process.env) => {
  const login = addressOf(env.SMTP_USER);
  const configured = addressOf(env.EMAIL_FROM);
  const useLogin = /@/.test(login) && (!configured || configured.toLowerCase() !== login.toLowerCase());
  const address = useLogin ? login : configured;
  const name = senderName || String(env.EMAIL_FROM || '').match(/^"?([^"<]+?)"?\s*</)?.[1] || '';
  return {
    from: name ? { name, address } : address,
    ...(useLogin && configured ? { replyTo: configured } : {}),
  };
};

/**
 * Send email notification to parent. Success means the SMTP server accepted the recipient;
 * every send is logged with its recipient and subject so a missing email can be traced.
 */
const sendEmail = async ({ to, subject, text, html, attachments }) => {
  try {
    const transport = getTransporter();
    const sender = buildSender(await getEmailSenderName());
    const info = await transport.sendMail({
      ...sender,
      to,
      subject,
      text,
      html,
      ...(attachments?.length ? { attachments } : {}),
    });
    const accepted = info.accepted?.length || 0;
    const rejected = info.rejected || [];
    console.log(`Email ${accepted ? 'sent' : 'NOT accepted'}: ${info.messageId} to=${to} subject="${subject}" rejected=${rejected.length}`);
    if (!accepted) return { success: false, permanent: true, error: `Recipient rejected: ${rejected.join(', ') || to}` };
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`Email send error to=${to} subject="${subject}":`, err.message);
    // 5xx means the server refused this message for good, except auth errors an admin can fix (a retry then succeeds).
    const permanent = err.responseCode >= 500 && ![530, 534, 535].includes(err.responseCode);
    return { success: false, permanent, error: err.message };
  }
};

/**
 * Send SMS via Fast2SMS (India)
 * Replace with Twilio or any other provider as needed.
 */
const sendSMS = async ({ phone, message }) => {
  try {
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) {
      console.warn('SMS API key not configured, skipping SMS');
      return { success: false, error: 'SMS not configured' };
    }

    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'q',
        message,
        language: 'english',
        flash: 0,
        numbers: phone,
      }),
    });

    const data = await response.json();
    console.log('SMS response:', data);
    return { success: data.return === true, data };
  } catch (err) {
    console.error('SMS send error:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Notify parent about student entry/exit.
 * `event` (optional) carries the real gate/terminal/verification details of this scan.
 */
const notifyParent = async (student, action, timestamp, event = {}) => {
  const enabled = await shouldSendEntryExitEmail(action);
  if (!enabled) {
    return {
      email: { success: false, skipped: true, reason: `Email notifications disabled for ${action}` },
      sms: { success: false, skipped: true, reason: `Email notifications disabled for ${action}` },
    };
  }

  const time = new Date(timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const date = new Date(timestamp).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const actionText = action === 'entry' ? 'entered' : 'exited';

  const subject = `Campus ${action === 'entry' ? 'Entry' : 'Exit'} Notification`;
  const text = `Dear Parent,\n\nYour ward ${student.name} (SAP ID: ${student.sapId}) has ${actionText} the college campus at ${time} on ${date}.\n\nRegards,\nSmart Campus Monitoring System`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">Campus ${action === 'entry' ? 'Entry' : 'Exit'} Notification</h2>
      </div>
      <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
        <p>Dear Parent,</p>
        <p>Your ward <strong>${student.name}</strong> (SAP ID: <strong>${student.sapId}</strong>) has
           <strong>${actionText}</strong> the college campus.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Time</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${time}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>Date</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${date}</td></tr>
          <tr><td style="padding: 8px;"><strong>Category</strong></td>
              <td style="padding: 8px;">${isHosteller(student.category) ? 'Hostellers' : 'Dayscholars'}</td></tr>
        </table>
        <p style="color: #64748b; font-size: 12px;">This is an automated notification from the Smart Campus Monitoring System.</p>
      </div>
    </div>`;

  const results = { email: null, sms: null };

  // Send email to parent: premium template, falling back to the basic one if rendering fails.
  if (student.parentEmail) {
    let message = { subject, text, html };
    try {
      message = await composeParentEmail({ student, action, timestamp, event });
    } catch (err) {
      console.error('Email template error, using basic template:', err.message);
    }
    // Queued, not sent inline: emails go out one at a time in scan order and survive restarts and retries.
    const job = await enqueueEmail({
      to: student.parentEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
      meta: { studentId: String(student._id), sapId: student.sapId, action, at: timestamp },
    });
    results.email = { success: true, queued: true, jobId: job._id };
  }

  // Send SMS to parent
  if (student.parentPhone) {
    results.sms = await sendSMS({
      phone: student.parentPhone,
      message: `Smart Campus: Your ward ${student.name} has ${actionText} the college campus at ${time} on ${date}.`,
    });
  }

  return results;
};

module.exports = { sendEmail, sendSMS, notifyParent, buildSender };
