/**
 * Admin API for terminal sync. Admin only for changes; wardens get read-only views
 * scoped to their hostel. Never returns template data.
 */
const Student = require('../models/Student');
const TerminalConfig = require('../models/TerminalConfig');
const TerminalCommand = require('../models/TerminalCommand');
const ReconciliationReport = require('../models/ReconciliationReport');
const BiometricAuditLog = require('../models/BiometricAuditLog');
const SyncJob = require('../models/SyncJob');
const { createAuditLog } = require('../services/auditService');
const { getAccessibleHostelIds } = require('../services/wardenScopeService');
const sync = require('../services/sync/terminalSyncService');
const { retryFailedCommands, countsByTerminal, enqueueCommand, commandSummary } = require('../services/sync/commandQueue');
const { runReconciliation } = require('../services/sync/reconciliation');
const { recordConsent, withdrawConsent, getActiveConsent } = require('../services/sync/consentService');
const { recordBiometricAudit } = require('../services/sync/biometricAudit');
const { terminalGroups, normalize, hostelGroup } = require('../services/sync/groups');
const { resumeJob } = require('../services/sync/bulkLoader');
const enrollment = require('../services/enrollment/enrollmentService');
const { getSidecar } = require('../services/sidecar');
const { getSyncConfig } = require('../config/terminalSync');
const { emitSyncTerminal } = require('../services/socketService');
const TerminalUserState = require('../models/TerminalUserState');
const { capabilitiesFor } = require('../services/terminals/terminalAdapters');
const { recomputeStudentSyncStatus } = require('../services/sync/syncStatus');

/** Users present and fingerprints stored/verified per terminal (from acks and read-backs). */
const presenceCounts = async () => {
  const rows = await TerminalUserState.aggregate([
    { $match: { present: true } },
    {
      $project: {
        terminalSN: 1,
        stored: { $size: { $filter: { input: { $ifNull: ['$templates', []] }, cond: { $in: ['$$this.state', ['stored', 'verified']] } } } },
        verified: { $size: { $filter: { input: { $ifNull: ['$templates', []] }, cond: { $eq: ['$$this.state', 'verified'] } } } },
      },
    },
    { $group: { _id: '$terminalSN', users: { $sum: 1 }, fingerprintsStored: { $sum: '$stored' }, fingerprintsVerified: { $sum: '$verified' } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r]));
};

const sendError = (res, error) => res.status(error.statusCode || 500).json({ message: error.message });

const isWarden = (req) => req.admin?.role === 'warden';

const wardenTerminalFilter = async (req) => {
  if (!isWarden(req)) return {};
  const hostelIds = await getAccessibleHostelIds(req.admin);
  return { $or: [{ hostel: { $in: hostelIds } }, { groups: { $in: hostelIds.map(hostelGroup) } }] };
};

const assertStudentScope = async (req, studentId) => {
  const student = await Student.findById(studentId).select('hostel').lean();
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  if (isWarden(req)) {
    const hostelIds = await getAccessibleHostelIds(req.admin);
    if (!student.hostel || !hostelIds.includes(String(student.hostel))) {
      throw Object.assign(new Error('Not authorized for this student'), { statusCode: 403 });
    }
  }
  return student;
};

const audit = (req, action, entity, entityId, newValue) =>
  createAuditLog({ admin: req.admin, action, entity, entityId, newValue, ipAddress: req.ip }).catch(() => null);

const serializeTerminal = (terminal, counts = {}, presence = {}) => ({
  _id: terminal._id,
  serialNumber: terminal.deviceSN,
  ip: terminal.terminalIP,
  machineNumber: terminal.machineNumber,
  terminalLabel: terminal.terminalLabel,
  gateName: terminal.gateName,
  terminalType: terminal.terminalType,
  role: terminal.role || (terminal.isEnrollmentStation ? 'enrollment' : 'gate'),
  groups: terminal.groups || [],
  effectiveGroups: terminalGroups(terminal),
  dialect: terminal.dialect || 'unknown',
  dialectSource: terminal.dialectSource || '',
  pushVersion: terminal.pushVersion || '',
  firmware: terminal.firmware || '',
  algorithmVersion: terminal.algorithmVersion || '',
  tlsSupported: terminal.tlsSupported ?? null,
  enabled: terminal.enabled !== false,
  commKeySet: Boolean(terminal.commKeySet),
  online: Boolean(terminal.isOnline),
  status: terminal.status || 'unknown',
  lastSeenAt: terminal.lastSeen,
  lastSyncAt: terminal.lastSyncAt || null,
  pending: (counts.pending || 0) + (counts.sent || 0),
  failed: counts.failed || 0,
  deviceRole: terminal.deviceRole || (terminal.isEnrollmentStation ? 'ADMIN_ENROLLMENT' : 'GATE_TOGGLE'),
  deviceModel: terminal.deviceModel || 'X990',
  communicationProtocol: terminal.communicationProtocol || 'adms_push',
  simulated: Boolean(terminal.simulated),
  location: terminal.location || '',
  enrolledUsers: presence.users || 0,
  fingerprintsStored: presence.fingerprintsStored || 0,
  fingerprintsVerified: presence.fingerprintsVerified || 0,
  capabilities: capabilitiesFor(terminal),
});

// GET /api/sync/overview
exports.getOverview = async (req, res) => {
  try {
    const terminalFilter = await wardenTerminalFilter(req);
    const [terminals, counts, awaiting, enrolled, lastReport, failedTotal, pendingTotal, presence, syncBreakdown] = await Promise.all([
      TerminalConfig.find(terminalFilter).lean(),
      countsByTerminal(),
      Student.countDocuments({ isActive: true, fingerprintStatus: 'awaiting' }),
      Student.countDocuments({ isActive: true, fingerprintStatus: 'enrolled' }),
      ReconciliationReport.findOne().sort({ startedAt: -1 }).lean(),
      TerminalCommand.countDocuments({ status: 'failed' }),
      TerminalCommand.countDocuments({ status: { $in: ['pending', 'sent'] } }),
      presenceCounts(),
      Student.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$syncStatus', count: { $sum: 1 } } }]),
    ]);
    const rows = terminals.map((t) => serializeTerminal(t, counts[t.deviceSN], presence[t.deviceSN]));
    const byRole = (role) => rows.filter((t) => t.deviceRole === role);
    res.json({
      terminals: {
        total: rows.length,
        online: rows.filter((t) => t.online).length,
        offline: rows.filter((t) => !t.online).length,
        unknownDialect: rows.filter((t) => t.dialect === 'unknown').length,
        withFailures: rows.filter((t) => t.failed > 0).length,
      },
      commands: { pending: pendingTotal, failed: failedTotal },
      students: {
        awaitingFingerprint: awaiting,
        enrolled,
        bySyncStatus: Object.fromEntries((syncBreakdown || []).map((r) => [r._id || 'NOT_ENROLLED', r.count])),
      },
      devices: {
        ADMIN_ENROLLMENT: byRole('ADMIN_ENROLLMENT'),
        GATE_ENTRY: byRole('GATE_ENTRY'),
        GATE_EXIT: byRole('GATE_EXIT'),
        GATE_TOGGLE: byRole('GATE_TOGGLE'),
      },
      simulationMode: getSyncConfig().simulationMode,
      lastReconciliation: lastReport ? { runId: lastReport.runId, startedAt: lastReport.startedAt } : null,
      config: {
        reconcileSource: getSyncConfig().reconcile.source,
        sidecar: Boolean(getSidecar()),
        maxCommandsPerPoll: getSyncConfig().adms.maxCommandsPerPoll,
        templateSizeMode: getSyncConfig().adms.templateSizeMode,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/sync/terminals
exports.listTerminals = async (req, res) => {
  try {
    const [terminals, counts, presence] = await Promise.all([
      TerminalConfig.find(await wardenTerminalFilter(req)).sort({ machineNumber: 1 }).lean(),
      countsByTerminal(),
      presenceCounts(),
    ]);
    res.json({
      simulationMode: getSyncConfig().simulationMode,
      terminals: terminals.map((t) => serializeTerminal(t, counts[t.deviceSN], presence[t.deviceSN])),
    });
  } catch (error) {
    sendError(res, error);
  }
};

// PATCH /api/sync/terminals/:sn
exports.updateTerminal = async (req, res) => {
  try {
    const terminal = await TerminalConfig.findOne({ deviceSN: req.params.sn });
    if (!terminal) return res.status(404).json({ message: 'Terminal not found' });
    const before = serializeTerminal(terminal.toObject());
    const { groups, enabled, dialect, commKeySet, tlsSupported, deviceRole, communicationProtocol, deviceModel, simulated } = req.body;
    if (deviceRole !== undefined) terminal.deviceRole = deviceRole;
    if (communicationProtocol !== undefined) terminal.communicationProtocol = communicationProtocol;
    if (deviceModel !== undefined) terminal.deviceModel = deviceModel;
    if (simulated !== undefined) terminal.simulated = Boolean(simulated);
    if (groups !== undefined) terminal.groups = groups;
    if (enabled !== undefined) terminal.enabled = Boolean(enabled);
    if (dialect !== undefined) {
      terminal.dialect = dialect;
      terminal.dialectSource = dialect === 'unknown' ? '' : 'manual';
    }
    if (commKeySet !== undefined) terminal.commKeySet = Boolean(commKeySet);
    if (tlsSupported !== undefined) terminal.tlsSupported = tlsSupported === null ? null : Boolean(tlsSupported);
    await terminal.save();
    const after = serializeTerminal(terminal.toObject());
    await audit(req, `Updated sync settings for terminal ${terminal.deviceSN}`, 'TerminalConfig', terminal._id, {
      before: { groups: before.groups, enabled: before.enabled, dialect: before.dialect, deviceRole: before.deviceRole, protocol: before.communicationProtocol },
      after: { groups: after.groups, enabled: after.enabled, dialect: after.dialect, deviceRole: after.deviceRole, protocol: after.communicationProtocol },
    });
    emitSyncTerminal({ terminalSN: terminal.deviceSN, event: 'updated' });
    res.json({ terminal: after });
  } catch (error) {
    if (/reserved for the enrollment station/.test(error.message)) error.statusCode = 400;
    sendError(res, error);
  }
};

// POST /api/sync/terminals/:sn/resync
exports.resyncTerminal = async (req, res) => {
  try {
    const terminal = await TerminalConfig.findOne({ deviceSN: req.params.sn }).lean();
    if (!terminal) return res.status(404).json({ message: 'Terminal not found' });
    const result = await sync.enqueueForNewTerminal(terminal, { actor: req.admin, mode: req.body?.mode || 'auto' });
    await audit(req, `Resync terminal ${terminal.deviceSN}`, 'TerminalConfig', terminal._id, result);
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/sync/terminals/:sn/probe
exports.probeTerminal = async (req, res) => {
  try {
    const terminal = await TerminalConfig.findOneAndUpdate(
      { deviceSN: req.params.sn },
      { $set: { dialect: 'unknown', dialectSource: '' } },
      { new: true }
    ).lean();
    if (!terminal) return res.status(404).json({ message: 'Terminal not found' });
    const { command } = await enqueueCommand({
      terminal,
      type: 'PROBE',
      params: { pin: getSyncConfig().adms.probePin },
      dedupeSuffix: 'classic',
      dialectName: 'classic',
    });
    await audit(req, `Dialect probe queued for ${terminal.deviceSN}`, 'TerminalConfig', terminal._id, { cmdId: command.cmdId });
    res.json({ queued: true, cmdId: command.cmdId });
  } catch (error) {
    sendError(res, error);
  }
};

const requireSidecarTerminal = async (sn) => {
  const sidecar = getSidecar();
  if (!sidecar) throw Object.assign(new Error('Sidecar is not configured (SIDECAR_URL)'), { statusCode: 400 });
  const terminal = await TerminalConfig.findOne({ deviceSN: sn }).lean();
  if (!terminal) throw Object.assign(new Error('Terminal not found'), { statusCode: 404 });
  if (!terminal.terminalIP) throw Object.assign(new Error('Terminal has no IP configured'), { statusCode: 400 });
  return { sidecar, terminal };
};

// GET /api/sync/terminals/:sn/info
exports.terminalInfo = async (req, res) => {
  try {
    const { sidecar, terminal } = await requireSidecarTerminal(req.params.sn);
    const info = await sidecar.info(terminal.terminalIP);
    const update = {};
    if (info?.firmware) update.firmware = String(info.firmware).slice(0, 64);
    if (info?.algorithm) update.algorithmVersion = String(info.algorithm).slice(0, 32);
    if (Object.keys(update).length) await TerminalConfig.updateOne({ _id: terminal._id }, { $set: update });
    const serialMismatch = info?.serial && String(info.serial) !== terminal.deviceSN;
    res.json({ info, serialMismatch: Boolean(serialMismatch) });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/sync/terminals/:sn/backup
exports.backupTerminal = async (req, res) => {
  try {
    const { sidecar, terminal } = await requireSidecarTerminal(req.params.sn);
    const result = await sidecar.backup(terminal.terminalIP);
    await recordBiometricAudit({ actor: req.admin, action: 'backup', terminal: terminal.deviceSN, details: { file: result?.file, users: result?.users, templates: result?.templates } });
    await audit(req, `Backup of terminal ${terminal.deviceSN}`, 'TerminalConfig', terminal._id, { file: result?.file });
    res.json({ file: result?.file, users: result?.users, templates: result?.templates });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/sync/groups
exports.listGroups = async (req, res) => {
  try {
    const terminals = await TerminalConfig.find(await wardenTerminalFilter(req)).lean();
    const groups = {};
    terminals.forEach((terminal) => {
      terminalGroups(terminal).forEach((group) => {
        groups[group] = groups[group] || { group, terminals: [] };
        groups[group].terminals.push(terminal.deviceSN);
      });
    });
    res.json({ groups: Object.values(groups).sort((a, b) => a.group.localeCompare(b.group)) });
  } catch (error) {
    sendError(res, error);
  }
};

// PUT /api/sync/groups/:group/terminals  { terminalSNs: [] }
exports.setGroupTerminals = async (req, res) => {
  try {
    const [group] = normalize([req.params.group]);
    if (!group) return res.status(400).json({ message: 'Invalid group' });
    const sns = req.body.terminalSNs || [];
    await TerminalConfig.updateMany({ deviceSN: { $in: sns } }, { $addToSet: { groups: group } });
    await TerminalConfig.updateMany({ deviceSN: { $nin: sns }, groups: group }, { $pull: { groups: group } });
    await audit(req, `Set terminals of group ${group}`, 'TerminalGroup', null, { group, terminalSNs: sns });
    res.json({ group, terminalSNs: sns });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/sync/students/:id
exports.getStudentSync = async (req, res) => {
  try {
    await assertStudentScope(req, req.params.id);
    const overall = await recomputeStudentSyncStatus(req.params.id);
    const status = await sync.getStudentSyncStatus(req.params.id);
    const consent = await getActiveConsent(await Student.findById(req.params.id).select('consentRef').lean());
    res.json({
      ...status,
      syncStatus: overall?.syncStatus,
      gateSync: overall?.gateSync || [],
      consent: consent
        ? { recordedAt: consent.recordedAt, givenBy: consent.givenBy, isMinor: consent.isMinor, method: consent.method }
        : null,
    });
  } catch (error) {
    sendError(res, error);
  }
};

// PATCH /api/sync/students/:id/groups
exports.setStudentGroups = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const before = student.targetTerminalGroups;
    student.targetTerminalGroups = req.body.targetTerminalGroups || [];
    await student.save({ validateBeforeSave: false });
    const result = await sync.enqueueProvision(student, { actor: req.admin, reason: 'resync' });
    await audit(req, `Changed terminal groups for ${student.name} (${student.sapId})`, 'Student', student._id, {
      before,
      after: student.targetTerminalGroups,
    });
    res.json({ targetTerminalGroups: student.targetTerminalGroups, sync: result });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/sync/students/:id/resync
exports.resyncStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const result =
      student.accessStatus === 'blocked' || !student.isActive
        ? await sync.enqueueDelete(student, { actor: req.admin, reason: 'resync_blocked' })
        : await sync.enqueueProvision(student, { actor: req.admin, reason: 'resync' });
    await audit(req, `Resync student ${student.name} (${student.sapId})`, 'Student', student._id, result);
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/sync/students/:id/consent
exports.recordStudentConsent = async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, isActive: true });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const consent = await recordConsent({ student, ...req.body, actor: req.admin });
    await audit(req, `Recorded biometric consent for ${student.name} (${student.sapId})`, 'Student', student._id, {
      consentId: consent._id,
      givenBy: consent.givenBy,
      isMinor: consent.isMinor,
    });
    res.status(201).json({ consent: { _id: consent._id, givenBy: consent.givenBy, isMinor: consent.isMinor, recordedAt: consent.recordedAt } });
  } catch (error) {
    res.status(error.name === 'ValidationError' || /minor/.test(error.message) ? 400 : 500).json({ message: error.message });
  }
};

// DELETE /api/sync/students/:id/consent  { reason }  (withdrawal → erasure)
exports.withdrawStudentConsent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    await withdrawConsent({ student, reason: req.body?.reason || '', actor: req.admin });
    const erasure = await sync.deEnrolAndErase(student, { actor: req.admin, reason: 'consent_withdrawn' });
    await audit(req, `Consent withdrawn and biometrics erased for ${student.name} (${student.sapId})`, 'Student', student._id, erasure);
    res.json({ withdrawn: true, erasure });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/sync/students/:id/erase  { confirmSapId }
exports.eraseStudentBiometrics = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (String(req.body?.confirmSapId || '') !== student.sapId) {
      return res.status(400).json({ message: 'confirmSapId must match the student SAP ID' });
    }
    const erasure = await sync.deEnrolAndErase(student, { actor: req.admin, reason: req.body?.reason || 'de_enrolment' });
    await audit(req, `De-enrolled and erased biometrics for ${student.name} (${student.sapId})`, 'Student', student._id, erasure);
    res.json(erasure);
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/sync/enrollment/methods
exports.listEnrollmentMethods = (_req, res) => {
  res.json({ methods: enrollment.listEnrollmentMethods(), defaultMethod: getSyncConfig().enrollment.defaultMethod });
};

// POST /api/sync/students/:id/enrollment/start
exports.startEnrollment = async (req, res) => {
  try {
    const result = await enrollment.startEnrollment(req.params.id, { ...req.body, actor: req.admin });
    await audit(req, `Started fingerprint enrolment (${result.method}) for student ${req.params.id}`, 'Student', req.params.id, {
      method: result.method,
      pin: result.pin,
      terminal: result.terminal.deviceSN,
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/sync/students/:id/enrollment/fetch
exports.fetchEnrollmentTemplate = async (req, res) => {
  try {
    res.json(await enrollment.fetchEnrollmentTemplate(req.params.id, { ...req.body, actor: req.admin }));
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/sync/students/:id/enrollment
exports.getEnrollmentStatus = async (req, res) => {
  try {
    const status = await enrollment.getEnrollmentStatus(req.params.id);
    const sync_ = await sync.getStudentSyncStatus(req.params.id);
    res.json({ ...status, terminals: sync_?.terminals || [], templates: sync_?.templates || [] });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/sync/commands
exports.listCommands = async (req, res) => {
  try {
    const { status, terminalSN, student, type } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const filter = {};
    if (status) filter.status = status;
    if (terminalSN) filter.terminalSN = terminalSN;
    if (student) filter.student = student;
    if (type) filter.type = type;
    const [rows, total] = await Promise.all([
      TerminalCommand.find(filter)
        .select('-templateRef')
        .populate('student', 'name sapId')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TerminalCommand.countDocuments(filter),
    ]);
    res.json({ commands: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/sync/commands/retry  { ids?, terminalSN? }
exports.retryCommands = async (req, res) => {
  try {
    const filter = {};
    if (Array.isArray(req.body?.ids) && req.body.ids.length) filter._id = { $in: req.body.ids };
    if (req.body?.terminalSN) filter.terminalSN = req.body.terminalSN;
    const result = await retryFailedCommands(filter);
    await audit(req, 'Retried failed terminal commands', 'TerminalCommand', null, { filter: req.body, ...result });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/sync/commands/:id/cancel
exports.cancelCommand = async (req, res) => {
  try {
    const command = await TerminalCommand.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['pending', 'failed'] } },
      { $set: { status: 'cancelled', open: false, lastError: 'cancelled by admin' } },
      { new: true }
    );
    if (!command) return res.status(404).json({ message: 'Command not found or not cancellable' });
    await audit(req, `Cancelled terminal command ${command.type} #${command.cmdId} on ${command.terminalSN}`, 'TerminalCommand', command._id, null);
    res.json(commandSummary(command));
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/sync/reconciliation
exports.listReconciliationReports = async (req, res) => {
  try {
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const filter = req.query.runId ? { runId: req.query.runId } : {};
    const reports = await ReconciliationReport.find(filter).sort({ startedAt: -1 }).limit(limit).lean();
    res.json({ reports });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/sync/reconciliation/run  { source?, terminalSNs? }
exports.runReconciliationNow = async (req, res) => {
  try {
    const summary = await runReconciliation({ source: req.body?.source, terminalSNs: req.body?.terminalSNs, actor: req.admin });
    await audit(req, 'Ran terminal reconciliation', 'TerminalSync', null, summary);
    res.json(summary);
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/sync/audit
exports.listBiometricAudit = async (req, res) => {
  try {
    const filter = {};
    if (req.query.student) filter.student = req.query.student;
    if (req.query.terminal) filter.terminal = req.query.terminal;
    if (req.query.action) filter.action = req.query.action;
    if (isWarden(req)) {
      const hostelIds = await getAccessibleHostelIds(req.admin);
      const ids = await Student.find({ hostel: { $in: hostelIds } }).distinct('_id');
      filter.student = filter.student ? filter.student : { $in: ids };
      if (req.query.student && !ids.map(String).includes(String(req.query.student))) {
        return res.status(403).json({ message: 'Not authorized for this student' });
      }
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const [rows, total] = await Promise.all([
      BiometricAuditLog.find(filter).populate('student', 'name sapId').sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      BiometricAuditLog.countDocuments(filter),
    ]);
    res.json({ logs: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/sync/jobs
exports.listJobs = async (_req, res) => {
  try {
    const jobs = await SyncJob.find().select('-studentIds').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ jobs });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/sync/jobs/:jobId/resume
exports.resumeSyncJob = async (req, res) => {
  try {
    await resumeJob(req.params.jobId);
    await audit(req, `Resumed sync job ${req.params.jobId}`, 'SyncJob', null, null);
    res.json({ resumed: true });
  } catch (error) {
    sendError(res, error);
  }
};
