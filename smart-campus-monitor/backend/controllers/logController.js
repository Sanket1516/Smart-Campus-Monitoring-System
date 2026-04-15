const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const Student = require('../models/Student');
const { CATEGORY_ALIASES, normalizeCategory } = require('../utils/studentMeta');
const { resolveAssignedHostel } = require('../services/wardenScopeService');

// GET /api/logs
exports.getLogs = async (req, res) => {
  try {
    const { date, sapId, sapid, category, status, page = 1, limit = 50 } = req.query;
    const filter = {};
    const sapIdQuery = (sapId || sapid || '').trim();

    if (date) filter.date = date;
    if (sapIdQuery) filter.sapId = { $regex: sapIdQuery, $options: 'i' };
    if (category) {
      const normalizedCategory = normalizeCategory(category);
      filter.category = CATEGORY_ALIASES[normalizedCategory]
        ? { $in: CATEGORY_ALIASES[normalizedCategory] }
        : normalizedCategory;
    }
    if (status) filter.status = status;

    if (req.admin.role === 'warden') {
      const assignedHostel = await resolveAssignedHostel(req.admin);

      if (!assignedHostel?._id) {
        return res.json({ logs: [], total: 0, page: Number(page), pages: 0 });
      }

      const students = await Student.find({
        hostel: assignedHostel._id,
        isActive: true,
      })
        .select('sapId')
        .lean();

      filter.sapId = filter.sapId
        ? filter.sapId
        : { $in: students.map((student) => student.sapId) };

      if (filter.sapId.$regex) {
        const matchingSapIds = students
          .map((student) => student.sapId)
          .filter((studentSapId) => new RegExp(filter.sapId.$regex, filter.sapId.$options).test(studentSapId));
        filter.sapId = { $in: matchingSapIds };
      }
    }

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
    if (req.admin.role === 'warden') {
      return res.json({ logs: [], total: 0, page: 1, pages: 0 });
    }

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
    if (req.admin.role === 'warden') {
      return res.status(403).json({ message: 'Wardens cannot resolve unauthorized logs' });
    }

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
