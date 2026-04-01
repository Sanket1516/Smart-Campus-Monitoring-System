const Student = require('../models/Student');
const {
  normalizeCategory,
  normalizeCourse,
  normalizeDepartment,
} = require('../utils/studentMeta');
const { createAuditLog } = require('../services/auditService');

const normalizeStudentPayload = (payload = {}) => ({
  ...payload,
  ...(payload.category !== undefined ? { category: normalizeCategory(payload.category) } : {}),
  ...(payload.course !== undefined ? { course: normalizeCourse(payload.course) } : {}),
  ...(payload.department !== undefined
    ? { department: normalizeDepartment(payload.department) }
    : {}),
});

// GET /api/students/:sapId
exports.getStudentBySapId = async (req, res) => {
  try {
    const student = await Student.findOne({ sapId: req.params.sapId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/students
exports.getAllStudents = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 50 } = req.query;
    const filter = { isActive: true };

    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sapId: { $regex: search, $options: 'i' } },
      ];
    }

    const students = await Student.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Student.countDocuments(filter);

    res.json({ students, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/students
exports.createStudent = async (req, res) => {
  try {
    const student = await Student.create(normalizeStudentPayload(req.body));

    await createAuditLog({
      admin: req.admin,
      action: `Created student ${student.name} (${student.sapId})`,
      entity: 'Student',
      entityId: student._id,
      oldValue: null,
      newValue: student.toObject(),
      ipAddress: req.ip,
    });

    res.status(201).json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/students/:sapId
exports.updateStudent = async (req, res) => {
  try {
    const previousStudent = await Student.findOne({ sapId: req.params.sapId }).lean();
    if (!previousStudent) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const student = await Student.findOneAndUpdate(
      { sapId: req.params.sapId },
      normalizeStudentPayload(req.body),
      { new: true, runValidators: true }
    );

    await createAuditLog({
      admin: req.admin,
      action: `Updated student ${student.name} (${student.sapId})`,
      entity: 'Student',
      entityId: student._id,
      oldValue: previousStudent,
      newValue: student.toObject(),
      ipAddress: req.ip,
    });

    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/students/:sapId
exports.deleteStudent = async (req, res) => {
  try {
    const previousStudent = await Student.findOne({ sapId: req.params.sapId }).lean();
    if (!previousStudent) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const student = await Student.findOneAndUpdate(
      { sapId: req.params.sapId },
      { isActive: false },
      { new: true }
    );

    await createAuditLog({
      admin: req.admin,
      action: `Deactivated student ${student.name} (${student.sapId})`,
      entity: 'Student',
      entityId: student._id,
      oldValue: previousStudent,
      newValue: student.toObject(),
      ipAddress: req.ip,
    });

    res.json({ message: 'Student deactivated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
