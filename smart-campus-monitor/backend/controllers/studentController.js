const Student = require('../models/Student');
const DeviceAllocation = require('../models/DeviceAllocation');
const {
  normalizeCategory,
  normalizeCourse,
  normalizeDepartment,
} = require('../utils/studentMeta');
const { createAuditLog } = require('../services/auditService');
const { getStudentAllocations, reconcileStudentDeviceAllocations } = require('../services/deviceAllocationService');
const { removeStudentFromDeviceAllocations, syncStudentToAllTerminals } = require('../services/fingerprintService');
const syncHooks = require('../services/sync/hooks');

const getStudentsQuery = (filter = {}) =>
  Student.find(filter).populate('hostel', 'name code warden wardenEmail wardenPhone');

const getStudentByFilter = (filter = {}) =>
  Student.findOne(filter).populate('hostel', 'name code warden wardenEmail wardenPhone');

const handleStudentMutationError = (res, err) => {
  if (err?.code === 11000) {
    if (err.keyPattern?.sapId) {
      return res.status(400).json({ message: 'Student with this SAP ID already exists' });
    }

    return res.status(400).json({ message: 'Duplicate student data detected' });
  }

  if (err?.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }

  return res.status(500).json({ message: err.message });
};

const normalizeStudentPayload = (payload = {}) => {
  const normalizedPayload = {
    ...payload,
    ...(payload.category !== undefined ? { category: normalizeCategory(payload.category) } : {}),
    ...(payload.course !== undefined ? { course: normalizeCourse(payload.course) } : {}),
    ...(payload.department !== undefined
      ? { department: normalizeDepartment(payload.department) }
      : {}),
  };

  if (normalizedPayload.category !== undefined) {
    const isHosteller = normalizedPayload.category === 'hostellers';

    normalizedPayload.studentType = isHosteller ? 'hosteller' : 'day_scholar';
    normalizedPayload.isHosteller = isHosteller;
    normalizedPayload.wardenApprovalRequired = isHosteller
      ? Boolean(payload.wardenApprovalRequired ?? true)
      : false;

    if (!isHosteller) {
      normalizedPayload.hostel = null;
      normalizedPayload.roomNumber = '';
    }
  }

  return normalizedPayload;
};

// GET /api/students/:sapId
exports.getStudentBySapId = async (req, res) => {
  try {
    const student = await getStudentByFilter({ sapId: req.params.sapId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(student);
  } catch (err) {
    handleStudentMutationError(res, err);
  }
};

// GET /api/students
exports.getAllStudents = async (req, res) => {
  try {
    const { category, page = 1 } = req.query;
    let { search } = req.query;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const filter = { isActive: true };

    if (category) filter.category = String(category);
    // Optional directory filters (exact match on known values only).
    const exact = {
      department: (v) => String(v).slice(0, 80),
      year: (v) => (Number.isInteger(Number(v)) ? Number(v) : undefined),
      studentType: (v) => (['day_scholar', 'hosteller'].includes(v) ? v : undefined),
      fingerprintStatus: (v) => (['none', 'awaiting', 'enrolled'].includes(v) ? v : undefined),
      accessStatus: (v) => (['allowed', 'blocked'].includes(v) ? v : undefined),
      syncStatus: (v) => (/^[A-Z_]{3,40}$/.test(v) ? v : undefined),
    };
    Object.entries(exact).forEach(([key, sanitize]) => {
      if (req.query[key] === undefined || req.query[key] === '') return;
      const value = sanitize(req.query[key]);
      if (value !== undefined) filter[key] = value;
    });
    if (search) {
      // Escape user input before using it in a regular expression.
      search = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sapId: { $regex: search, $options: 'i' } },
      ];
    }

    const students = await getStudentsQuery(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Student.countDocuments(filter);

    res.json({ students, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    handleStudentMutationError(res, err);
  }
};

// POST /api/students
exports.createStudent = async (req, res) => {
  try {
    const student = await Student.create({
      ...normalizeStudentPayload(req.body),
      // Only the finger capture is manual: user records are queued on every target terminal now.
      fingerprintStatus: 'awaiting',
    });
    const terminalSync = await syncHooks.onStudentCreated(student, req.admin);
    const populatedStudent = await getStudentByFilter({ _id: student._id });

    await createAuditLog({
      admin: req.admin,
      action: `Created student ${student.name} (${student.sapId})`,
      entity: 'Student',
      entityId: student._id,
      oldValue: null,
      newValue: populatedStudent.toObject(),
      ipAddress: req.ip,
    });

    res.status(201).json({ student: populatedStudent, terminalSync });
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

    await Student.findOneAndUpdate(
      { sapId: req.params.sapId },
      normalizeStudentPayload(req.body),
      { runValidators: true }
    );

    const student = await getStudentByFilter({ sapId: req.params.sapId });

    let allocationResult = null;

    if (syncHooks.legacyDirectSync()) {
      if (student.fingerprintEnrolled) {
        allocationResult = await reconcileStudentDeviceAllocations(student);

        if (allocationResult.removedAllocations.length) {
          removeStudentFromDeviceAllocations(allocationResult.removedAllocations).catch((error) => {
            console.error('Failed to remove obsolete student allocations:', error.message);
          });
        }

        await syncStudentToAllTerminals(student);
      }
    } else {
      // Name or hostel/group changes: re-queue user records; prune old terminals.
      await syncHooks.onStudentUpdated(student, req.admin);
    }

    await createAuditLog({
      admin: req.admin,
      action: `Updated student ${student.name} (${student.sapId})`,
      entity: 'Student',
      entityId: student._id,
      oldValue: previousStudent,
      newValue: {
        ...student.toObject(),
        deviceAllocations: allocationResult?.allocations || null,
      },
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

    const previousAllocations = await getStudentAllocations(previousStudent._id);

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
      newValue: {
        ...student.toObject(),
        deviceAllocations: previousAllocations,
      },
      ipAddress: req.ip,
    });

    if (syncHooks.legacyDirectSync()) {
      if (previousAllocations.length) {
        await DeviceAllocation.deleteMany({ studentId: student._id });
        removeStudentFromDeviceAllocations(previousAllocations).catch((error) => {
          console.error('Failed to remove device users for deactivated student:', error.message);
        });
      }

      return res.json({ message: 'Student deactivated' });
    }

    // Student leaves: delete from every terminal and erase templates (DPDP s.8(7)).
    const terminalSync = await syncHooks.onStudentDeactivated(student, req.admin);
    res.json({ message: 'Student deactivated', terminalSync });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/students/upload  (retired)
// The old endpoint inserted rows immediately with no preview, size limit or duplicate/format checks.
// Bulk enrolment now goes through /api/students/bulk (validate -> preview -> confirm).
exports.uploadStudentsExcel = (req, res) => {
  res.status(410).json({
    message: 'This endpoint was replaced. Use the bulk enrollment workflow (POST /api/students/bulk/validate, then confirm).',
  });
};
