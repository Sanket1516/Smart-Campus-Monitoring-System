const Student = require('../models/Student');
const AccessControlLog = require('../models/AccessControlLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const TerminalConfig = require('../models/TerminalConfig');
const AlertLog = require('../models/AlertLog');

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const BLOCKED_ATTEMPT_REASON = 'Blocked student attempted fingerprint access';

const endOfToday = () => {
  const start = startOfToday();
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
};

const serializeBlockedStudent = (student) => ({
  _id: student._id,
  name: student.name,
  sapId: student.sapId,
  department: student.department,
  year: student.year,
  photoUrl: student.photoUrl,
  studentType: student.studentType,
  hostel: student.hostel,
  roomNumber: student.roomNumber,
  accessStatus: student.accessStatus,
  blockReason: student.blockReason,
  blockedAt: student.blockedAt,
  blockedBy: student.blockedBy,
  unblockReason: student.unblockReason,
  unblockedAt: student.unblockedAt,
  fingerprintEnrolled: student.fingerprintEnrolled,
});

// POST /api/access/block/:studentId
exports.blockStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { reason, note = '' } = req.body;

    const student = await Student.findOne({ _id: studentId, isActive: true });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.accessStatus === 'blocked') {
      return res.status(400).json({ message: 'Student is already blocked' });
    }

    const finalReason = note?.trim() ? `${reason} - ${note.trim()}` : reason;
    const now = new Date();

    student.accessStatus = 'blocked';
    student.blockReason = finalReason;
    student.blockedBy = req.admin._id;
    student.blockedAt = now;
    student.unblockReason = '';
    student.unblockedAt = null;
    await student.save();

    await AccessControlLog.create({
      student: student._id,
      action: 'blocked',
      reason: finalReason,
      performedBy: req.admin._id,
      timestamp: now,
    });

    const populatedStudent = await Student.findById(student._id)
      .populate('hostel', 'name')
      .populate('blockedBy', 'name email');

    res.json({
      success: true,
      student: serializeBlockedStudent(populatedStudent),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/access/unblock/:studentId
exports.unblockStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body;

    const student = await Student.findOne({ _id: studentId, isActive: true });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (student.accessStatus !== 'blocked') {
      return res.status(400).json({ message: 'Student is not currently blocked' });
    }

    const now = new Date();

    student.accessStatus = 'allowed';
    student.unblockReason = reason.trim();
    student.unblockedAt = now;
    await student.save();

    await AccessControlLog.create({
      student: student._id,
      action: 'unblocked',
      reason: reason.trim(),
      performedBy: req.admin._id,
      timestamp: now,
    });

    const populatedStudent = await Student.findById(student._id)
      .populate('hostel', 'name')
      .populate('blockedBy', 'name email');

    res.json({
      success: true,
      student: serializeBlockedStudent(populatedStudent),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/access/blocked
exports.getBlockedStudents = async (req, res) => {
  try {
    const { department, hostel, date } = req.query;
    const filter = {
      isActive: true,
      accessStatus: 'blocked',
    };

    if (department) {
      filter.department = department;
    }

    if (hostel) {
      filter.hostel = hostel;
    }

    if (date) {
      const selectedDate = new Date(date);
      if (!Number.isNaN(selectedDate.getTime())) {
        filter.blockedAt = {
          $gte: selectedDate,
          $lt: new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000),
        };
      }
    }

    const todayStart = startOfToday();
    const todayEnd = endOfToday();

    const [blockedStudents, totalBlocked, blockedToday, unauthorizedToday, blockedAttemptsToday, terminalStats] =
      await Promise.all([
        Student.find(filter)
          .populate('hostel', 'name')
          .populate('blockedBy', 'name email')
          .sort({ blockedAt: -1 }),
        Student.countDocuments({ isActive: true, accessStatus: 'blocked' }),
        Student.countDocuments({
          isActive: true,
          accessStatus: 'blocked',
          blockedAt: { $gte: todayStart, $lt: todayEnd },
        }),
        UnauthorizedLog.countDocuments({
          timestamp: { $gte: todayStart, $lt: todayEnd },
        }),
        AlertLog.countDocuments({
          type: 'blocked',
          timestamp: { $gte: todayStart, $lt: todayEnd },
        }),
        TerminalConfig.aggregate([
          {
            $group: {
              _id: null,
              online: {
                $sum: {
                  $cond: [{ $eq: ['$isOnline', true] }, 1, 0],
                },
              },
              offline: {
                $sum: {
                  $cond: [{ $eq: ['$isOnline', false] }, 1, 0],
                },
              },
            },
          },
        ]),
      ]);

    res.json({
      blockedStudents: blockedStudents.map(serializeBlockedStudent),
      summary: {
        totalBlocked,
        blockedToday,
        unauthorizedToday,
        blockedAttemptsToday,
        terminalsOnline: terminalStats[0]?.online || 0,
        terminalsOffline: terminalStats[0]?.offline || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/access/log/:studentId
exports.getAccessLogs = async (req, res) => {
  try {
    const { studentId } = req.params;

    const [student, logs] = await Promise.all([
      Student.findById(studentId).select('name sapId'),
      AccessControlLog.find({
        student: studentId,
        reason: { $ne: BLOCKED_ATTEMPT_REASON },
      })
        .populate('performedBy', 'name email role')
        .sort({ timestamp: -1 }),
    ]);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json({
      student,
      logs,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
