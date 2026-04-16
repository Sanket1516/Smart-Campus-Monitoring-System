const Student = require('../models/Student');
const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const AccessControlLog = require('../models/AccessControlLog');
const AlertLog = require('../models/AlertLog');
const HostellerRequest = require('../models/HostellerRequest');
const { notifyParent } = require('../services/notification');
const { emitScanBlocked, emitScanUnauthorized } = require('../services/socketService');
const { isHosteller } = require('../utils/studentMeta');
const { isPastCurfew } = require('../services/configService');

// Helper: get today's date string
const todayStr = () => new Date().toISOString().split('T')[0];

// POST /api/scan
exports.processScan = async (req, res) => {
  try {
    const { sapId } = req.body;

    if (!sapId) {
      return res.status(400).json({ message: 'SAP ID is required' });
    }

    const student = await Student.findOne({ sapId, isActive: true }).select('+hostel');

    // Unauthorized scan
    if (!student) {
      await UnauthorizedLog.create({
        scannedValue: sapId,
        date: todayStr(),
      });

      emitScanUnauthorized({
        gateName: '',
        terminalNumber: null,
        terminalLabel: '',
        machineNumber: null,
        time: new Date().toISOString(),
        attemptNumber: 1,
      });

      return res.status(404).json({
        authorized: false,
        message: 'UNAUTHORIZED: SAP ID not found in database',
        scannedValue: sapId,
      });
    }

    const today = todayStr();
    const now = new Date();

    if (student.accessStatus === 'blocked') {
      const blockReason = student.blockReason || 'Access blocked';

      await UnauthorizedLog.create({
        scannedValue: sapId,
        date: today,
        timestamp: now,
        notes: `Blocked student attempted access: ${blockReason}`,
      });

      await AccessControlLog.create({
        student: student._id,
        action: 'blocked',
        reason: blockReason,
        performedBy: student.blockedBy || null,
        timestamp: now,
      });

      await AlertLog.create({
        type: 'blocked',
        message: `${student.name} attempted access while blocked`,
        metadata: {
          studentId: student._id,
          studentName: student.name,
          sapId: student.sapId,
          studentType: student.studentType,
          blockReason,
          time: now.toISOString(),
        },
      });

      const attemptNumber = await UnauthorizedLog.countDocuments({ scannedValue: sapId, date: today });

      emitScanUnauthorized({
        gateName: '',
        terminalNumber: null,
        terminalLabel: '',
        machineNumber: null,
        time: now.toISOString(),
        attemptNumber,
      });

      emitScanBlocked({
        studentName: student.name,
        sapId: student.sapId,
        studentType: student.studentType,
        hostelName: '',
        gateName: '',
        gateNumber: null,
        terminalNumber: null,
        terminalLabel: '',
        machineNumber: null,
        deviceSN: '',
        time: now.toISOString(),
        blockReason,
      });

      return res.status(403).json({
        authorized: false,
        blocked: true,
        message: 'ACCESS DENIED: Student is blocked',
        student: {
          sapId: student.sapId,
          name: student.name,
          category: student.category,
        },
        blockReason,
      });
    }

    let activeRequest = null;
    if (isHosteller(student.category) && student.wardenApprovalRequired) {
      activeRequest = await HostellerRequest.findOne({
        student: student._id,
        status: 'approved',
        accessValidUntil: { $gt: now },
      });

      if (!activeRequest) {
        return res.status(403).json({
          authorized: false,
          wardenRequired: true,
          message: 'WARDEN APPROVAL REQUIRED: Hosteller request not approved',
          student: {
            sapId: student.sapId,
            name: student.name,
            category: student.category,
          },
        });
      }
    }

    // Use the latest log for today so repeated entry/exit cycles toggle correctly.
    let log = await EntryLog.findOne({ sapId, date: today }).sort({ createdAt: -1 });

    let action;

    if (!log) {
      // No entry for today → mark ENTRY
      log = await EntryLog.create({
        sapId,
        studentName: student.name,
        category: student.category,
        date: today,
        entryTime: now,
        status: 'entered',
      });
      action = 'entry';
    } else if (log.status === 'entered') {
      // Already entered → mark EXIT
      log.exitTime = now;
      log.status = 'exited';

      // Check late return for hostellers
      if (isHosteller(student.category)) {
        if (await isPastCurfew(now, student.hostel)) {
          log.lateReturn = true;
        }
      }

      await log.save();
      action = 'exit';
    } else {
      // Already exited → new entry (re-entry)
      log = await EntryLog.create({
        sapId,
        studentName: student.name,
        category: student.category,
        date: today,
        entryTime: now,
        status: 'entered',
      });
      action = 'entry';
    }

    // Send parent notification (fire and forget)
    notifyParent(student, action, now).catch((err) =>
      console.error('Notification error:', err.message)
    );

    if (activeRequest) {
      if (action === 'exit') {
        activeRequest.usedForExit = true;
      }

      if (action === 'entry') {
        activeRequest.usedForEntry = true;

        if (activeRequest.usedForExit) {
          activeRequest.status = 'completed';
        }
      }

      await activeRequest.save();
    }

    res.json({
      authorized: true,
      action,
      student: {
        sapId: student.sapId,
        name: student.name,
        category: student.category,
        department: student.department,
        year: student.year,
        photoUrl: student.photoUrl,
      },
      log: {
        entryTime: log.entryTime,
        exitTime: log.exitTime,
        status: log.status,
        lateReturn: log.lateReturn,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
