const Student = require('../models/Student');
const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const TerminalConfig = require('../models/TerminalConfig');
const HostellerRequest = require('../models/HostellerRequest');
const AccessControlLog = require('../models/AccessControlLog');
const AlertLog = require('../models/AlertLog');
const { notifyParent } = require('../services/notification');
const {
  emitScanLive,
  emitScanBlocked,
  emitScanUnauthorized,
  emitWardenRequired,
  emitTerminalOnline,
  emitUnknownTerminal,
} = require('../services/socketService');
const { isHosteller } = require('../utils/studentMeta');

const formatISTDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const buildTerminalPayload = (terminal, overrides = {}) => ({
  deviceSN: overrides.deviceSN || terminal.deviceSN,
  deviceName: overrides.deviceName || terminal.deviceName,
  machineNumber: terminal.machineNumber,
  gateName: terminal.gateName,
  gateNumber: terminal.gateNumber,
  terminalNumber: terminal.terminalNumber,
  terminalLabel: terminal.terminalLabel,
  location: terminal.location,
});

const isStudentHosteller = (student) =>
  student.studentType === 'hosteller' || student.isHosteller || isHosteller(student.category);

const markTerminalSeen = async (terminal, now, deviceName) => {
  const wasOffline = !terminal.isOnline;

  terminal.isOnline = true;
  terminal.lastSeen = now;

  if (deviceName) {
    terminal.deviceName = deviceName;
  }

  await terminal.save();

  if (wasOffline) {
    emitTerminalOnline(buildTerminalPayload(terminal));
  }
};

const processEntryExit = async (student, terminal, now) => {
  const today = formatISTDate(now);
  let log = await EntryLog.findOne({ sapId: student.sapId, date: today }).sort({ createdAt: -1 });
  let action;

  if (!log) {
    log = await EntryLog.create({
      sapId: student.sapId,
      studentName: student.name,
      category: student.category || (student.studentType === 'hosteller' ? 'hostellers' : 'dayscholars'),
      date: today,
      entryTime: now,
      status: 'entered',
      ...buildTerminalPayload(terminal),
    });
    action = 'entry';
  } else if (log.status === 'entered') {
    log.exitTime = now;
    log.status = 'exited';

    if (isStudentHosteller(student)) {
      const curfewHour = Number(process.env.CURFEW_HOUR) || 22;

      if (now.getHours() >= curfewHour) {
        log.lateReturn = true;
      }
    }

    Object.assign(log, buildTerminalPayload(terminal));
    await log.save();
    action = 'exit';
  } else {
    log = await EntryLog.create({
      sapId: student.sapId,
      studentName: student.name,
      category: student.category || (student.studentType === 'hosteller' ? 'hostellers' : 'dayscholars'),
      date: today,
      entryTime: now,
      status: 'entered',
      ...buildTerminalPayload(terminal),
    });
    action = 'entry';
  }

  return { action, log };
};

// POST /api/fingerprint/scan
exports.processFingerprintScan = async (req, res) => {
  try {
    const {
      deviceSN,
      deviceName = '',
      machineNumber,
      userId,
      timestamp,
      verifyMode,
    } = req.body;

    const now = timestamp ? new Date(timestamp) : new Date();
    const terminal = await TerminalConfig.findOne({ machineNumber: Number(machineNumber) });

    if (!terminal || terminal.deviceSN !== String(deviceSN)) {
      const payload = {
        deviceSN,
        machineNumber: Number(machineNumber),
        time: now.toISOString(),
      };

      await AlertLog.create({
        type: 'unauthorized',
        message: `Unknown terminal attempted to scan on machine ${machineNumber}`,
        metadata: payload,
      });

      emitUnknownTerminal(payload);
      return res.json({ allow: false });
    }

    if (terminal.isEnrollmentStation) {
      await markTerminalSeen(terminal, now, deviceName);
      return res.json({ allow: false });
    }

    const terminalPayload = buildTerminalPayload(terminal, { deviceName });
    const student = await Student.findOne({
      zktUserID: Number(userId),
      isActive: true,
    })
      .populate({
        path: 'hostel',
        select: 'name warden',
        populate: {
          path: 'warden',
          select: 'name email',
        },
      })
      .populate('blockedBy', 'name');

    if (!student) {
      const today = formatISTDate(now);

      await markTerminalSeen(terminal, now, deviceName);

      await UnauthorizedLog.create({
        scannedValue: String(userId),
        date: today,
        timestamp: now,
        ...terminalPayload,
      });

      const attemptNumber = await UnauthorizedLog.countDocuments({
        machineNumber: terminal.machineNumber,
        date: today,
      });

      await AlertLog.create({
        type: 'unauthorized',
        message: `Unauthorized fingerprint attempt at ${terminal.terminalLabel}`,
        metadata: {
          ...terminalPayload,
          time: now.toISOString(),
          attemptNumber,
          verifyMode,
        },
      });

      emitScanUnauthorized({
        gateName: terminal.gateName,
        terminalNumber: terminal.terminalNumber,
        terminalLabel: terminal.terminalLabel,
        machineNumber: terminal.machineNumber,
        deviceSN: terminal.deviceSN,
        time: now.toISOString(),
        attemptNumber,
      });

      return res.json({ allow: false });
    }

    if (student.accessStatus === 'blocked') {
      await markTerminalSeen(terminal, now, deviceName);

      await AccessControlLog.create({
        student: student._id,
        action: 'blocked',
        reason: student.blockReason || 'Blocked student attempted fingerprint access',
        performedBy: student.blockedBy?._id || null,
        timestamp: now,
      });

      await AlertLog.create({
        type: 'blocked',
        message: `${student.name} attempted access while blocked at ${terminal.terminalLabel}`,
        metadata: {
          ...terminalPayload,
          studentId: student._id,
          studentName: student.name,
          sapId: student.sapId,
          blockReason: student.blockReason,
          time: now.toISOString(),
        },
      });

      emitScanBlocked({
        studentName: student.name,
        sapId: student.sapId,
        studentType: student.studentType,
        hostelName: student.hostel?.name || '',
        gateName: terminal.gateName,
        gateNumber: terminal.gateNumber,
        terminalNumber: terminal.terminalNumber,
        terminalLabel: terminal.terminalLabel,
        machineNumber: terminal.machineNumber,
        deviceSN: terminal.deviceSN,
        time: now.toISOString(),
        blockReason: student.blockReason || 'Access blocked',
      });

      return res.json({ allow: false });
    }

    let activeRequest = null;

    if (isStudentHosteller(student) && student.wardenApprovalRequired) {
      activeRequest = await HostellerRequest.findOne({
        student: student._id,
        status: 'approved',
        accessValidUntil: { $gt: now },
      }).populate('warden', 'name');

      if (!activeRequest) {
        await markTerminalSeen(terminal, now, deviceName);

        emitWardenRequired({
          studentName: student.name,
          sapId: student.sapId,
          hostelName: student.hostel?.name || '',
          wardenName: student.hostel?.warden?.name || '',
          gateName: terminal.gateName,
          gateNumber: terminal.gateNumber,
          terminalNumber: terminal.terminalNumber,
          terminalLabel: terminal.terminalLabel,
          machineNumber: terminal.machineNumber,
          deviceSN: terminal.deviceSN,
          time: now.toISOString(),
        });

        return res.json({ allow: false });
      }
    }

    const wasOffline = !terminal.isOnline;
    const { action } = await processEntryExit(student, terminal, now);
    terminal.isOnline = true;
    terminal.lastSeen = now;
    terminal.deviceName = deviceName || terminal.deviceName;
    terminal.scansToday += 1;
    terminal.totalScans += 1;
    await terminal.save();

    if (wasOffline) {
      emitTerminalOnline(buildTerminalPayload(terminal));
    }

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

    notifyParent(student, action, now).catch((error) => {
      console.error('Fingerprint notification error:', error.message);
    });

    emitScanLive({
      studentName: student.name,
      sapId: student.sapId,
      photo: student.photoUrl || '',
      studentType: student.studentType,
      hostelName: student.hostel?.name || '',
      gateName: terminal.gateName,
      gateNumber: terminal.gateNumber,
      terminalNumber: terminal.terminalNumber,
      terminalLabel: terminal.terminalLabel,
      machineNumber: terminal.machineNumber,
      deviceSN: terminal.deviceSN,
      type: action,
      time: now.toISOString(),
      department: student.department,
    });

    return res.json({ allow: true });
  } catch (error) {
    console.error('Fingerprint scan failed:', error.message);
    return res.json({ allow: false });
  }
};

// POST /api/fingerprint/heartbeat
exports.processFingerprintHeartbeat = async (req, res) => {
  try {
    const { deviceSN, deviceName = '', machineNumber } = req.body;
    const terminal = await TerminalConfig.findOne({ machineNumber: Number(machineNumber) });

    if (!terminal || terminal.deviceSN !== String(deviceSN)) {
      return res.status(401).json({ message: 'Terminal authentication failed' });
    }

    await markTerminalSeen(terminal, new Date(), deviceName);

    return res.json({
      success: true,
      terminal: {
        machineNumber: terminal.machineNumber,
        terminalLabel: terminal.terminalLabel,
        isOnline: terminal.isOnline,
        lastSeen: terminal.lastSeen,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
