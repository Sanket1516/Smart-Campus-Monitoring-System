const AuditLog = require('../models/AuditLog');
const Admin = require('../models/Admin');
const { sendEmail } = require('../services/notification');
const { emitSettingsUpdated } = require('../services/socketService');
const {
  getDefaultConfig,
  getSystemConfig,
  normalizeConfigValue,
  upsertSystemConfig,
} = require('../services/configService');
const { createAuditLog } = require('../services/auditService');

const emitSystemConfigurationUpdates = (nextValue, previousValue, admin) => {
  const previous = previousValue && typeof previousValue === 'object' ? previousValue : {};
  const current = nextValue && typeof nextValue === 'object' ? nextValue : {};
  const trackedKeys = ['collegeName', 'collegeLogo', 'cloudflareUrl', 'timezone', 'maintenanceMode'];

  trackedKeys.forEach((field) => {
    if (previous[field] !== current[field]) {
      emitSettingsUpdated({
        key: `system_configuration.${field}`,
        newValue: current[field],
        updatedBy: admin?.name || admin?.username || 'admin',
      });
    }
  });
};

// GET /api/settings/:key
exports.getSettingByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const value = await getSystemConfig(key, getDefaultConfig(key));

    res.json({
      key,
      value,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/settings/:key
exports.updateSettingByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const previousValue = await getSystemConfig(key, getDefaultConfig(key));
    const normalizedValue = normalizeConfigValue(key, req.body.value);

    const config = await upsertSystemConfig({
      key,
      value: normalizedValue,
      updatedBy: req.admin?._id || null,
    });

    await createAuditLog({
      admin: req.admin,
      action: `Updated ${key}`,
      entity: 'SystemConfig',
      entityId: config._id,
      oldValue: previousValue,
      newValue: config.value,
      ipAddress: req.ip,
    });

    if (key === 'system_configuration') {
      emitSystemConfigurationUpdates(config.value, previousValue, req.admin);
    } else {
      emitSettingsUpdated({
        key,
        newValue: config.value,
        updatedBy: req.admin?.name || req.admin?.username || 'admin',
      });
    }

    res.json({
      key,
      value: config.value,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/settings/audit
exports.getAuditLogs = async (req, res) => {
  try {
    const { adminId, action, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (adminId) {
      filter.admin = adminId;
    }

    if (action) {
      filter.action = { $regex: action, $options: 'i' };
    }

    if (dateFrom || dateTo) {
      filter.timestamp = {};
      if (dateFrom) filter.timestamp.$gte = new Date(`${dateFrom}T00:00:00`);
      if (dateTo) filter.timestamp.$lte = new Date(`${dateTo}T23:59:59.999`);
    }

    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.max(1, Math.min(200, Number(limit) || 50));
    const skip = (pageNumber - 1) * limitNumber;

    const [logs, total, admins] = await Promise.all([
      AuditLog.find(filter)
        .populate('admin', 'name username email role')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      AuditLog.countDocuments(filter),
      Admin.find({ isActive: true })
        .select('name username email role')
        .sort({ name: 1 })
        .lean(),
    ]);

    res.json({
      logs,
      admins,
      total,
      page: pageNumber,
      pages: Math.max(1, Math.ceil(total / limitNumber)),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/settings/test-email
exports.sendTestEmail = async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ message: 'Recipient email is required' });
    }

    const result = await sendEmail({
      to,
      subject: 'Smart Campus Settings Test Email',
      text: 'This is a test email from the Smart Campus settings panel.',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Settings Test Email</h2>
          <p>This confirms your email settings are working correctly.</p>
        </div>
      `,
    });

    if (result?.success === false) {
      return res.status(500).json({ message: result.error || 'Failed to send test email' });
    }

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
