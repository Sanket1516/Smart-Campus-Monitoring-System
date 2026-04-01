const AlertLog = require('../models/AlertLog');

// GET /api/alerts
exports.getAlerts = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 50));
    const adminId = req.admin._id;

    const [alerts, unreadCount] = await Promise.all([
      AlertLog.find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean(),
      AlertLog.countDocuments({ readBy: { $ne: adminId } }),
    ]);

    res.json({
      alerts,
      unreadCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/alerts/read
exports.markAlertsRead = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const alertIds = Array.isArray(req.body.alertIds) ? req.body.alertIds : [];

    const filter = alertIds.length
      ? { _id: { $in: alertIds }, readBy: { $ne: adminId } }
      : { readBy: { $ne: adminId } };

    await AlertLog.updateMany(filter, {
      $addToSet: { readBy: adminId },
    });

    const unreadCount = await AlertLog.countDocuments({ readBy: { $ne: adminId } });

    res.json({ message: 'Alerts marked as read', unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
