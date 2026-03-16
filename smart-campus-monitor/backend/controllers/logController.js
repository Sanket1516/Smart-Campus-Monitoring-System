const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');

// GET /api/logs
exports.getLogs = async (req, res) => {
  try {
    const { date, sapId, category, status, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (date) filter.date = date;
    if (sapId) filter.sapId = sapId;
    if (category) filter.category = category;
    if (status) filter.status = status;

    const logs = await EntryLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await EntryLog.countDocuments(filter);

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/logs/unauthorized
exports.getUnauthorizedLogs = async (req, res) => {
  try {
    const { date, resolved, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (date) filter.date = date;
    if (resolved !== undefined) filter.resolved = resolved === 'true';

    const logs = await UnauthorizedLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await UnauthorizedLog.countDocuments(filter);

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/logs/unauthorized/:id/resolve
exports.resolveUnauthorized = async (req, res) => {
  try {
    const log = await UnauthorizedLog.findByIdAndUpdate(
      req.params.id,
      { resolved: true, notes: req.body.notes || '' },
      { new: true }
    );
    if (!log) {
      return res.status(404).json({ message: 'Log not found' });
    }
    res.json(log);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
