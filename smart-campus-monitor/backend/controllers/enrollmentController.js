const crypto = require('crypto');
const Student = require('../models/Student');
const Hostel = require('../models/Hostel');
const TerminalConfig = require('../models/TerminalConfig');
const {
  pushUserToDevice,
  pullTemplateFromDevice,
  removeStudentFromDeviceAllocations,
  syncStudentToAllTerminals,
} = require('../services/fingerprintService');
const { createAuditLog } = require('../services/auditService');
const {
  getStudentAllocations,
  reconcileStudentDeviceAllocations,
} = require('../services/deviceAllocationService');

const syncHooks = require('../services/sync/hooks');
const enrollmentService = require('../services/enrollment/enrollmentService');
const terminalSync = require('../services/sync/terminalSyncService');
const BiometricTemplate = require('../models/BiometricTemplate');

// Legacy (LEGACY_ZK_DIRECT_SYNC=true) only. No fallback secret: FP_SECRET must be set.
const buildKey = () => {
  if (!process.env.FP_SECRET) {
    throw new Error('FP_SECRET is required for the legacy direct-sync enrolment path');
  }
  return crypto.createHash('sha256').update(String(process.env.FP_SECRET)).digest();
};

const encryptTemplate = (templateBuffer) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', buildKey(), iv);
  const encrypted = Buffer.concat([cipher.update(templateBuffer), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

const getEnrollmentStation = async () => {
  const terminal = await TerminalConfig.findOne({ machineNumber: 50, isEnrollmentStation: true });

  if (!terminal || !terminal.terminalIP) {
    throw new Error('Enrollment station (machine 50) is not configured with a terminal IP');
  }

  return terminal;
};

const sanitizeStudent = async (studentId) =>
  Student.findById(studentId)
    .populate({
      path: 'hostel',
      select: 'name code type warden wardenEmail wardenPhone',
      populate: {
        path: 'warden',
        select: 'name email phone',
      },
    })
    .populate('blockedBy', 'name email');

const buildEnrollmentSummary = (student) => ({
  _id: student._id,
  sapId: student.sapId,
  name: student.name,
  email: student.email,
  parentEmail: student.parentEmail,
  parentPhone: student.parentPhone,
  department: student.department,
  course: student.course,
  year: student.year,
  photoUrl: student.photoUrl,
  fingerprintEnrolled: student.fingerprintEnrolled,
  fingerprintEnrolledAt: student.fingerprintEnrolledAt,
  fingerprintStatus: student.fingerprintStatus,
  targetTerminalGroups: student.targetTerminalGroups,
  zktUserID: student.zktUserID,
  studentType: student.studentType,
  hostel: student.hostel,
  roomNumber: student.roomNumber,
  isHosteller: student.isHosteller,
  wardenApprovalRequired: student.wardenApprovalRequired,
  accessStatus: student.accessStatus,
});

// New terminal-sync path for initiate: assign the PIN and start "menu" enrolment.
const initiateEnrollmentViaSync = async (req, res) => {
  const { studentId } = req.params;
  const { zktUserID } = req.body;
  const student = await Student.findOne({ _id: studentId, isActive: true });

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  if (!student.zktUserID && zktUserID) {
    const existingStudent = await Student.findOne({ zktUserID, _id: { $ne: studentId } }).select('_id sapId name');
    if (existingStudent) {
      return res.status(400).json({
        message: `ZKT user ID is already assigned to ${existingStudent.name} (${existingStudent.sapId})`,
      });
    }
    await Student.updateOne({ _id: studentId }, { $set: { zktUserID: Number(zktUserID) } });
  }

  const result = await enrollmentService.startEnrollment(studentId, {
    method: req.body.method,
    targetGroups: req.body.targetGroups,
    fingerIndex: req.body.fingerIndex,
    actor: req.admin,
  });

  return res.json({
    ready: true,
    message: result.instructions,
    enrollmentStation: { deviceSN: result.terminal.deviceSN, terminalLabel: result.terminal.terminalLabel },
    zktUserID: Number(result.pin),
    method: result.method,
    deviceResult: { queued: result.steps },
  });
};

// POST /api/enrollment/initiate/:studentId
exports.initiateEnrollment = async (req, res) => {
  if (!syncHooks.legacyDirectSync()) {
    try {
      return await initiateEnrollmentViaSync(req, res);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ message: error.message });
    }
  }

  try {
    const { studentId } = req.params;
    const { zktUserID } = req.body;

    const [student, existingStudent, enrollmentStation] = await Promise.all([
      Student.findOne({ _id: studentId, isActive: true }),
      Student.findOne({ zktUserID, _id: { $ne: studentId } }).select('_id sapId name'),
      getEnrollmentStation(),
    ]);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (existingStudent) {
      return res.status(400).json({
        message: `ZKT user ID is already assigned to ${existingStudent.name} (${existingStudent.sapId})`,
      });
    }

    const deviceResult = await pushUserToDevice(enrollmentStation.terminalIP, zktUserID, student.name);

    res.json({
      ready: true,
      message: 'Enrollment station is ready. Ask the student to place their finger on the device.',
      enrollmentStation: {
        machineNumber: enrollmentStation.machineNumber,
        terminalLabel: enrollmentStation.terminalLabel,
        terminalIP: enrollmentStation.terminalIP,
      },
      zktUserID: Number(zktUserID),
      deviceResult,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// New terminal-sync path for confirm: make sure a template is stored (pushed by the
// terminal or read by the sidecar), apply the student type, then fan out.
const confirmEnrollmentViaSync = async (req, res) => {
  const { studentId } = req.params;
  const { studentType, hostelId, roomNumber = '', wardenApprovalRequired = false } = req.body;
  const student = await Student.findOne({ _id: studentId, isActive: true });

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  let templateCount = await BiometricTemplate.countDocuments({ student: studentId, flag: { $ne: 0 } });
  let fetchResult = null;

  if (!templateCount) {
    fetchResult = await enrollmentService.fetchEnrollmentTemplate(studentId, { actor: req.admin });
    templateCount = await BiometricTemplate.countDocuments({ student: studentId, flag: { $ne: 0 } });
  }

  if (!templateCount) {
    return res.status(409).json({
      message:
        fetchResult?.mode === 'push_query'
          ? 'No template received yet. A template query was sent to the enrollment terminal; try again in a few seconds.'
          : 'No fingerprint template found for this student on the enrollment terminal yet.',
      fetch: fetchResult,
    });
  }

  const normalizedType = studentType === 'hosteller' ? 'hosteller' : 'day_scholar';
  const isHosteller = normalizedType === 'hosteller';
  let hostel = null;

  if (isHosteller) {
    hostel = await Hostel.findOne({ _id: hostelId, isActive: true });

    if (!hostel) {
      return res.status(400).json({ message: 'Valid hostel is required for hosteller enrollment' });
    }

    if (!roomNumber?.trim()) {
      return res.status(400).json({ message: 'Room number is required for hosteller enrollment' });
    }
  }

  await Student.findByIdAndUpdate(studentId, {
    $set: {
      fingerprintEnrolled: true,
      fingerprintEnrolledAt: student.fingerprintEnrolledAt || new Date(),
      fingerprintStatus: 'enrolled',
      studentType: normalizedType,
      hostel: isHosteller ? hostel._id : null,
      roomNumber: isHosteller ? roomNumber.trim() : '',
      isHosteller,
      wardenApprovalRequired: isHosteller ? Boolean(wardenApprovalRequired) : false,
    },
  });

  const syncResult = await terminalSync.enqueueProvision(studentId, { actor: req.admin, reason: 'enrolment_fanout' });
  const updatedStudent = await sanitizeStudent(studentId);

  await createAuditLog({
    admin: req.admin,
    action: `Enrolled fingerprint for ${updatedStudent.name} (${updatedStudent.sapId})`,
    entity: 'Student',
    entityId: studentId,
    oldValue: { fingerprintStatus: student.fingerprintStatus },
    newValue: {
      fingerprintStatus: 'enrolled',
      zktUserID: updatedStudent.zktUserID,
      studentType: normalizedType,
      hostel: hostel?._id || null,
      templates: templateCount,
      terminals: syncResult.terminals,
    },
    ipAddress: req.ip,
  });

  return res.json({
    success: true,
    student: buildEnrollmentSummary(updatedStudent),
    allocations: [],
    previousAllocations: [],
    sync: syncResult,
  });
};

// POST /api/enrollment/confirm/:studentId
exports.confirmEnrollment = async (req, res) => {
  if (!syncHooks.legacyDirectSync()) {
    try {
      return await confirmEnrollmentViaSync(req, res);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ message: error.message });
    }
  }

  try {
    const { studentId } = req.params;
    const {
      zktUserID,
      studentType,
      hostelId,
      roomNumber = '',
      wardenApprovalRequired = false,
    } = req.body;

    const [student, duplicateUser, enrollmentStation, previousAllocations] = await Promise.all([
      Student.findOne({ _id: studentId, isActive: true }).select('+fingerprintTemplate'),
      Student.findOne({ zktUserID, _id: { $ne: studentId } }).select('_id sapId name'),
      getEnrollmentStation(),
      getStudentAllocations(studentId),
    ]);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (duplicateUser) {
      return res.status(400).json({
        message: `ZKT user ID is already assigned to ${duplicateUser.name} (${duplicateUser.sapId})`,
      });
    }

    const previousState = {
      zktUserID: student.zktUserID,
      fingerprintEnrolled: student.fingerprintEnrolled,
      fingerprintEnrolledAt: student.fingerprintEnrolledAt,
      fingerprintTemplate: student.fingerprintTemplate,
      studentType: student.studentType,
      hostel: student.hostel,
      roomNumber: student.roomNumber,
      isHosteller: student.isHosteller,
      wardenApprovalRequired: student.wardenApprovalRequired,
    };

    let hostel = null;
    const normalizedType = studentType === 'hosteller' ? 'hosteller' : 'day_scholar';
    const isHosteller = normalizedType === 'hosteller';

    if (isHosteller) {
      hostel = await Hostel.findOne({ _id: hostelId, isActive: true }).populate('warden', 'name email phone');

      if (!hostel) {
        return res.status(400).json({ message: 'Valid hostel is required for hosteller enrollment' });
      }

      if (!roomNumber?.trim()) {
        return res.status(400).json({ message: 'Room number is required for hosteller enrollment' });
      }
    }

    const templateBuffer = await pullTemplateFromDevice(enrollmentStation.terminalIP, zktUserID);
    const encryptedTemplate = encryptTemplate(templateBuffer);

    await Student.findByIdAndUpdate(studentId, {
      $set: {
        zktUserID: Number(zktUserID),
        fingerprintEnrolled: true,
        fingerprintEnrolledAt: new Date(),
        fingerprintTemplate: encryptedTemplate,
        studentType: normalizedType,
        hostel: isHosteller ? hostel._id : null,
        roomNumber: isHosteller ? roomNumber.trim() : '',
        isHosteller,
        wardenApprovalRequired: isHosteller ? Boolean(wardenApprovalRequired) : false,
      },
    });

    let updatedStudent = await sanitizeStudent(studentId);
    let allocationResult;

    try {
      allocationResult = await reconcileStudentDeviceAllocations(updatedStudent);
    } catch (allocationError) {
      await Student.findByIdAndUpdate(studentId, { $set: previousState }, { runValidators: true });
      updatedStudent = await sanitizeStudent(studentId);
      throw allocationError;
    }

    if (allocationResult.removedAllocations.length) {
      removeStudentFromDeviceAllocations(allocationResult.removedAllocations).catch((cleanupError) => {
        console.error('Failed to remove obsolete device allocations:', cleanupError.message);
      });
    }

    const syncResult = await syncStudentToAllTerminals(updatedStudent);

    await createAuditLog({
      admin: req.admin,
      action: `Enrolled fingerprint for ${updatedStudent.name} (${updatedStudent.sapId})`,
      entity: 'Student',
      entityId: studentId,
      oldValue: { fingerprintEnrolled: false },
      newValue: {
        fingerprintEnrolled: true,
        zktUserID: Number(zktUserID),
        studentType: normalizedType,
        hostel: hostel?._id || null,
        roomNumber: isHosteller ? roomNumber.trim() : '',
        deviceAllocations: allocationResult.allocations,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      student: buildEnrollmentSummary(updatedStudent),
      allocations: allocationResult.allocations,
      previousAllocations,
      sync: syncResult,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/enrollment/update-type/:studentId
exports.updateEnrollmentType = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { studentType, hostelId, roomNumber = '', wardenApprovalRequired = false } = req.body;

    const student = await Student.findOne({ _id: studentId, isActive: true });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const normalizedType = studentType === 'hosteller' ? 'hosteller' : 'day_scholar';
    const isHosteller = normalizedType === 'hosteller';
    let hostel = null;

    if (isHosteller) {
      hostel = await Hostel.findOne({ _id: hostelId, isActive: true }).populate('warden', 'name email phone');

      if (!hostel) {
        return res.status(400).json({ message: 'Valid hostel is required for hosteller profile' });
      }

      if (!roomNumber?.trim()) {
        return res.status(400).json({ message: 'Room number is required for hosteller profile' });
      }
    }

    const previousState = {
      studentType: student.studentType,
      hostel: student.hostel,
      roomNumber: student.roomNumber,
      isHosteller: student.isHosteller,
      wardenApprovalRequired: student.wardenApprovalRequired,
    };

    await Student.findByIdAndUpdate(
      studentId,
      {
        $set: {
          studentType: normalizedType,
          hostel: isHosteller ? hostel._id : null,
          roomNumber: isHosteller ? roomNumber.trim() : '',
          isHosteller,
          wardenApprovalRequired: isHosteller ? Boolean(wardenApprovalRequired) : false,
        },
      },
      { runValidators: true }
    );

    const updatedStudent = await sanitizeStudent(studentId);
    let allocationResult = null;

    if (!syncHooks.legacyDirectSync()) {
      await syncHooks.onStudentUpdated(updatedStudent, req.admin);
    } else if (updatedStudent.fingerprintEnrolled) {
      allocationResult = await reconcileStudentDeviceAllocations(updatedStudent);

      if (allocationResult.removedAllocations.length) {
        removeStudentFromDeviceAllocations(allocationResult.removedAllocations).catch((error) => {
          console.error('Failed to remove obsolete enrollment allocations:', error.message);
        });
      }

      await syncStudentToAllTerminals(updatedStudent);
    }

    await createAuditLog({
      admin: req.admin,
      action: `Updated student type for ${updatedStudent.name} (${updatedStudent.sapId})`,
      entity: 'Student',
      entityId: studentId,
      oldValue: previousState,
      newValue: {
        studentType: normalizedType,
        hostel: isHosteller ? hostel?._id : null,
        roomNumber: isHosteller ? roomNumber.trim() : '',
        isHosteller,
        wardenApprovalRequired: isHosteller ? Boolean(wardenApprovalRequired) : false,
        deviceAllocations: allocationResult?.allocations || null,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      student: buildEnrollmentSummary(updatedStudent),
      allocations: allocationResult?.allocations || [],
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/enrollment/stats
exports.getEnrollmentStats = async (_req, res) => {
  try {
    const baseMatch = { isActive: true };

    const [totals, hostelBreakdown, departmentBreakdown] = await Promise.all([
      Student.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            enrolled: {
              $sum: {
                $cond: [{ $eq: ['$fingerprintEnrolled', true] }, 1, 0],
              },
            },
            dayScholars: {
              $sum: {
                $cond: [{ $eq: ['$studentType', 'day_scholar'] }, 1, 0],
              },
            },
            hostellers: {
              $sum: {
                $cond: [{ $eq: ['$studentType', 'hosteller'] }, 1, 0],
              },
            },
          },
        },
      ]),
      Student.aggregate([
        { $match: { ...baseMatch, hostel: { $ne: null } } },
        {
          $group: {
            _id: '$hostel',
            total: { $sum: 1 },
            enrolled: {
              $sum: {
                $cond: [{ $eq: ['$fingerprintEnrolled', true] }, 1, 0],
              },
            },
          },
        },
        {
          $lookup: {
            from: 'hostels',
            localField: '_id',
            foreignField: '_id',
            as: 'hostel',
          },
        },
        { $unwind: '$hostel' },
        {
          $project: {
            _id: 0,
            hostelId: '$hostel._id',
            hostelName: '$hostel.name',
            total: 1,
            enrolled: 1,
            pending: { $subtract: ['$total', '$enrolled'] },
          },
        },
        { $sort: { hostelName: 1 } },
      ]),
      Student.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: '$department',
            total: { $sum: 1 },
            enrolled: {
              $sum: {
                $cond: [{ $eq: ['$fingerprintEnrolled', true] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            department: '$_id',
            total: 1,
            enrolled: 1,
            pending: { $subtract: ['$total', '$enrolled'] },
          },
        },
        { $sort: { department: 1 } },
      ]),
    ]);

    const summary = totals[0] || {
      total: 0,
      enrolled: 0,
      dayScholars: 0,
      hostellers: 0,
    };

    res.json({
      total: summary.total,
      enrolled: summary.enrolled,
      pending: summary.total - summary.enrolled,
      breakdown: {
        dayScholars: summary.dayScholars,
        hostellers: summary.hostellers,
      },
      perHostel: hostelBreakdown,
      perDepartment: departmentBreakdown,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
