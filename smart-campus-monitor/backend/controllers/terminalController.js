const TerminalConfig = require('../models/TerminalConfig');
const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const { syncAllStudentsToNewTerminal } = require('../services/fingerprintService');
const { createAuditLog } = require('../services/auditService');

const toNumber = (value) => Number(value);

const buildTerminalPayload = (payload = {}, existingTerminal = null) => {
  const machineNumber = existingTerminal
    ? existingTerminal.machineNumber
    : toNumber(payload.machineNumber);
  const isEnrollmentStation = machineNumber === 50;
  const gateName = (payload.gateName || existingTerminal?.gateName || '').trim();
  const terminalNumber = isEnrollmentStation ? 0 : machineNumber % 100;
  const fallbackLabel = isEnrollmentStation
    ? gateName || existingTerminal?.terminalLabel || 'Enrollment Station'
    : `${gateName} Terminal ${terminalNumber}`;

  return {
    ...(existingTerminal ? {} : { machineNumber }),
    deviceSN: (payload.deviceSN || existingTerminal?.deviceSN || '').trim(),
    deviceName: (payload.deviceName || '').trim(),
    gateName,
    terminalLabel: (payload.terminalLabel || '').trim() || fallbackLabel,
    location: (payload.location || '').trim(),
    terminalIP: (payload.terminalIP || '').trim(),
    isEnrollmentStation,
  };
};

const findLatestLogForTerminal = async (machineNumber) => {
  const [latestEntryLog, latestUnauthorizedLog] = await Promise.all([
    EntryLog.findOne({ machineNumber }).sort({ createdAt: -1 }).lean(),
    UnauthorizedLog.findOne({ machineNumber }).sort({ createdAt: -1 }).lean(),
  ]);

  const candidates = [
    latestEntryLog
      ? {
          type: 'authorized',
          studentName: latestEntryLog.studentName,
          sapId: latestEntryLog.sapId,
          status: latestEntryLog.status,
          timestamp: latestEntryLog.exitTime || latestEntryLog.entryTime || latestEntryLog.createdAt,
        }
      : null,
    latestUnauthorizedLog
      ? {
          type: 'unauthorized',
          scannedValue: latestUnauthorizedLog.scannedValue,
          timestamp: latestUnauthorizedLog.timestamp || latestUnauthorizedLog.createdAt,
        }
      : null,
  ].filter(Boolean);

  candidates.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return candidates[0] || null;
};

const formatTerminalForResponse = async (terminal) => {
  const plainTerminal = terminal.toObject ? terminal.toObject() : terminal;
  const lastScanEvent = await findLatestLogForTerminal(plainTerminal.machineNumber);

  return {
    ...plainTerminal,
    lastScanEvent,
  };
};

// GET /api/terminals
exports.getTerminals = async (_req, res) => {
  try {
    const terminals = await TerminalConfig.find()
      .populate('addedBy', 'name username role')
      .sort({ isEnrollmentStation: 1, gateNumber: 1, terminalNumber: 1, gateName: 1 });

    const enrichedTerminals = await Promise.all(terminals.map(formatTerminalForResponse));

    res.json({ terminals: enrichedTerminals, total: enrichedTerminals.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/terminals/status
exports.getTerminalStatus = async (_req, res) => {
  try {
    const terminals = await TerminalConfig.find()
      .select(
        'machineNumber deviceSN deviceName gateName gateNumber terminalNumber terminalLabel location terminalIP isEnrollmentStation isOnline lastSeen scansToday totalScans addedAt'
      )
      .sort({ isEnrollmentStation: 1, gateNumber: 1, terminalNumber: 1, gateName: 1 })
      .lean();

    const online = terminals.filter((terminal) => terminal.isOnline).length;
    const offline = terminals.length - online;

    res.json({
      terminals,
      summary: {
        total: terminals.length,
        online,
        offline,
        enrollmentStations: terminals.filter((terminal) => terminal.isEnrollmentStation).length,
        gateTerminals: terminals.filter((terminal) => !terminal.isEnrollmentStation).length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/terminals
exports.createTerminal = async (req, res) => {
  try {
    const terminal = await TerminalConfig.create({
      ...buildTerminalPayload(req.body),
      addedBy: req.admin?._id || null,
    });

    await createAuditLog({
      admin: req.admin,
      action: `Created terminal ${terminal.terminalLabel}`,
      entity: 'TerminalConfig',
      entityId: terminal._id,
      oldValue: null,
      newValue: terminal.toObject(),
      ipAddress: req.ip,
    });

    if (!terminal.isEnrollmentStation && terminal.terminalIP) {
      syncAllStudentsToNewTerminal(terminal.terminalIP).catch((error) => {
        console.error('Initial terminal sync failed:', error.message);
      });
    }

    res.status(201).json(await formatTerminalForResponse(terminal));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/terminals/:machineNumber
exports.updateTerminal = async (req, res) => {
  try {
    const terminal = await TerminalConfig.findOne({ machineNumber: toNumber(req.params.machineNumber) });

    if (!terminal) {
      return res.status(404).json({ message: 'Terminal not found' });
    }

    const previousValue = terminal.toObject();
    Object.assign(terminal, buildTerminalPayload(req.body, terminal));
    await terminal.save();

    await createAuditLog({
      admin: req.admin,
      action: `Updated terminal ${terminal.terminalLabel}`,
      entity: 'TerminalConfig',
      entityId: terminal._id,
      oldValue: previousValue,
      newValue: terminal.toObject(),
      ipAddress: req.ip,
    });

    res.json(await formatTerminalForResponse(terminal));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/terminals/:machineNumber
exports.deleteTerminal = async (req, res) => {
  try {
    const terminal = await TerminalConfig.findOneAndDelete({
      machineNumber: toNumber(req.params.machineNumber),
    });

    if (!terminal) {
      return res.status(404).json({ message: 'Terminal not found' });
    }

    await createAuditLog({
      admin: req.admin,
      action: `Deleted terminal ${terminal.terminalLabel}`,
      entity: 'TerminalConfig',
      entityId: terminal._id,
      oldValue: terminal.toObject ? terminal.toObject() : terminal,
      newValue: null,
      ipAddress: req.ip,
    });

    res.json({ message: 'Terminal deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/terminals/:machineNumber/logs
exports.getTerminalLogs = async (req, res) => {
  try {
    const machineNumber = toNumber(req.params.machineNumber);
    const { page = 1, limit = 50 } = req.query;

    const [terminal, entryLogs, unauthorizedLogs] = await Promise.all([
      TerminalConfig.findOne({ machineNumber }).lean(),
      EntryLog.find({ machineNumber })
        .sort({ createdAt: -1 })
        .limit(Number(limit) * 2)
        .lean(),
      UnauthorizedLog.find({ machineNumber })
        .sort({ createdAt: -1 })
        .limit(Number(limit) * 2)
        .lean(),
    ]);

    if (!terminal) {
      return res.status(404).json({ message: 'Terminal not found' });
    }

    const mergedLogs = [
      ...entryLogs.map((log) => ({
        _id: log._id,
        type: 'authorized',
        studentName: log.studentName,
        sapId: log.sapId,
        category: log.category,
        status: log.status,
        timestamp: log.exitTime || log.entryTime || log.createdAt,
        entryTime: log.entryTime,
        exitTime: log.exitTime,
        lateReturn: log.lateReturn,
      })),
      ...unauthorizedLogs.map((log) => ({
        _id: log._id,
        type: 'unauthorized',
        scannedValue: log.scannedValue,
        resolved: log.resolved,
        notes: log.notes,
        timestamp: log.timestamp || log.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const skip = (Number(page) - 1) * Number(limit);
    const paginatedLogs = mergedLogs.slice(skip, skip + Number(limit));

    res.json({
      terminal,
      logs: paginatedLogs,
      total: mergedLogs.length,
      page: Number(page),
      pages: Math.max(1, Math.ceil(mergedLogs.length / Number(limit))),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
