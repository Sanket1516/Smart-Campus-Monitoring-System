/**
 * Nightly reconciliation: compare each terminal's actual user list with the desired
 * state from MongoDB, queue fixes and write a report.
 *
 * Sources (RECONCILE_SOURCE):
 *   sidecar  read users over ZK TCP via the sidecar (authoritative)
 *   push     queue "DATA QUERY USERINFO" (UNVERIFIED) and diff the USERINFO uploads
 *            received since the previous query
 *   state    diff against TerminalUserState only (acks + uploads; no device read)
 */
const crypto = require('crypto');
const Student = require('../../models/Student');
const TerminalConfig = require('../../models/TerminalConfig');
const TerminalCommand = require('../../models/TerminalCommand');
const TerminalUserState = require('../../models/TerminalUserState');
const ReconciliationReport = require('../../models/ReconciliationReport');
const AlertLog = require('../../models/AlertLog');
const { getSyncConfig } = require('../../config/terminalSync');
const { getSidecar } = require('../sidecar');
const { enqueueCommand, cancelOpenCommands } = require('./commandQueue');
const { withTerminalLock, createLimiter } = require('./terminalLock');
const { recordBiometricAudit } = require('./biometricAudit');
const { terminalGroups, studentGroups, intersects, isGateTerminal } = require('./groups');
const { emitSyncReconcile, emitSyncAlert } = require('../socketService');

/**
 * Pure diff.
 * @param desiredPins   Set<string>  PINs that should be on the terminal
 * @param actualPins    Set<string>  PINs found on the terminal
 * @param pinIndex      Map<string, {blocked:boolean, active:boolean}> every known student PIN
 */
const diffTerminal = ({ desiredPins, actualPins, pinIndex }) => {
  const missing = [];
  const extra = [];
  const blockedPresent = [];
  const unknownPins = [];
  desiredPins.forEach((pin) => {
    if (!actualPins.has(pin)) missing.push(pin);
  });
  actualPins.forEach((pin) => {
    const known = pinIndex.get(pin);
    if (!known) {
      unknownPins.push(pin);
    } else if (known.blocked) {
      blockedPresent.push(pin);
    } else if (!desiredPins.has(pin)) {
      extra.push(pin);
    }
  });
  const sort = (list) => list.sort((a, b) => Number(a) - Number(b));
  return { missing: sort(missing), extra: sort(extra), blockedPresent: sort(blockedPresent), unknownPins: sort(unknownPins) };
};

const loadStudentIndex = async () => {
  const students = await Student.find({ zktUserID: { $ne: null } })
    .select('_id name zktUserID isActive accessStatus targetTerminalGroups studentType isHosteller category hostel')
    .lean();
  const pinIndex = new Map();
  const byPin = new Map();
  students.forEach((student) => {
    const pin = String(student.zktUserID);
    byPin.set(pin, student);
    pinIndex.set(pin, { blocked: student.accessStatus === 'blocked' || student.isActive === false, active: student.isActive !== false });
  });
  return { students, pinIndex, byPin };
};

const desiredPinsFor = (terminal, students) => {
  if (!isGateTerminal(terminal)) return new Set();
  const groups = terminalGroups(terminal);
  return new Set(
    students
      .filter((s) => s.isActive !== false && s.accessStatus !== 'blocked' && intersects(studentGroups(s), groups))
      .map((s) => String(s.zktUserID))
  );
};

const readActualPins = async (terminal, source) => {
  if (source === 'sidecar') {
    const sidecar = getSidecar();
    if (!sidecar) throw new Error('RECONCILE_SOURCE=sidecar but no sidecar is configured');
    if (!terminal.terminalIP) throw new Error('terminal has no IP');
    const { users = [] } = (await withTerminalLock(terminal.deviceSN, () => sidecar.getUsers(terminal.terminalIP))) || {};
    const pins = new Set(users.map((u) => String(u.user_id)));
    // Refresh presence state from the authoritative read.
    const now = new Date();
    for (const pin of pins) {
      await TerminalUserState.updateOne(
        { terminalSN: terminal.deviceSN, pin },
        { $set: { present: true, lastConfirmedAt: now, source: 'audit' } },
        { upsert: true }
      );
    }
    await TerminalUserState.updateMany(
      { terminalSN: terminal.deviceSN, present: true, pin: { $nin: Array.from(pins) } },
      { $set: { present: false, lastConfirmedAt: now, source: 'audit', fingers: [] } }
    );
    return { pins, status: 'ok' };
  }

  if (source === 'push') {
    const last = await TerminalCommand.findOne({ terminalSN: terminal.deviceSN, type: 'USER_QUERY_ALL', status: 'acked' })
      .sort({ ackedAt: -1 })
      .lean();
    await enqueueCommand({ terminal, type: 'USER_QUERY_ALL', params: {} });
    if (!last?.sentAt) return { pins: null, status: 'pending_query' };
    const states = await TerminalUserState.find({
      terminalSN: terminal.deviceSN,
      source: 'audit',
      present: true,
      lastConfirmedAt: { $gte: last.sentAt },
    })
      .select('pin')
      .lean();
    return { pins: new Set(states.map((s) => s.pin)), status: 'ok' };
  }

  const states = await TerminalUserState.find({ terminalSN: terminal.deviceSN, present: true }).select('pin').lean();
  return { pins: new Set(states.map((s) => s.pin)), status: 'ok' };
};

const raiseSecurityAlert = async (terminal, pins) => {
  const message = `SECURITY: ${pins.length} blocked/inactive student(s) found on ${terminal.terminalLabel || terminal.deviceSN} during reconciliation (PINs ${pins.slice(0, 10).join(', ')}); deletion queued`;
  try {
    await AlertLog.create({ type: 'security_blocked_on_terminal', message, metadata: { terminalSN: terminal.deviceSN, pins } });
  } catch (_error) {
    /* ignore */
  }
  emitSyncAlert({ message, terminalSN: terminal.deviceSN, severity: 'security' });
};

const reconcileTerminal = async ({ terminal, runId, source, index }) => {
  const { reconcile } = getSyncConfig();
  const report = {
    runId,
    terminalSN: terminal.deviceSN,
    source,
    startedAt: new Date(),
    status: 'ok',
    missing: [],
    extra: [],
    blockedPresent: [],
    unknownPins: [],
    queued: 0,
  };
  const desiredPins = desiredPinsFor(terminal, index.students);
  report.desiredCount = desiredPins.size;

  try {
    const actual = await readActualPins(terminal, source);
    if (!actual.pins) {
      report.status = 'pending_query';
    } else {
      report.actualCount = actual.pins.size;
      const diff = diffTerminal({ desiredPins, actualPins: actual.pins, pinIndex: index.pinIndex });
      Object.assign(report, diff);
      const { queueStudentOnTerminals, enqueueDelete } = require('./terminalSyncService');

      for (const pin of diff.missing) {
        const student = await Student.findById(index.byPin.get(pin)._id);
        const result = await queueStudentOnTerminals(student, pin, [terminal], { jobId: runId });
        report.queued += result.queued;
      }
      for (const pin of diff.blockedPresent) {
        const result = await enqueueDelete(index.byPin.get(pin)._id, { actor: 'system', reason: 'reconcile_blocked_present' });
        report.queued += result.queued || 0;
      }
      if (diff.blockedPresent.length) await raiseSecurityAlert(terminal, diff.blockedPresent);
      for (const pin of diff.extra) {
        if (!isGateTerminal(terminal)) continue; // enrollment terminals legitimately hold users
        const student = index.byPin.get(pin);
        await cancelOpenCommands({ student: student._id, types: ['USER_CREATE', 'TEMPLATE_WRITE'], terminalSN: terminal.deviceSN, reason: 'reconcile: not desired' });
        const result = await enqueueCommand({ terminal, type: 'USER_DELETE', student: student._id, pin, params: { pin }, jobId: runId });
        if (result.created) report.queued += 1;
      }
      if (reconcile.deleteUnknownPins && isGateTerminal(terminal)) {
        for (const pin of diff.unknownPins) {
          const result = await enqueueCommand({ terminal, type: 'USER_DELETE', pin, params: { pin }, dedupeSuffix: `unknown:${pin}`, jobId: runId });
          if (result.created) report.queued += 1;
        }
      }
      const drift = diff.missing.length + diff.extra.length + diff.blockedPresent.length + diff.unknownPins.length;
      report.status = drift ? 'drift' : 'ok';
    }
  } catch (error) {
    report.status = 'error';
    report.error = error.message;
  }
  report.finishedAt = new Date();
  await ReconciliationReport.create(report);
  return report;
};

let running = false;

const runReconciliation = async ({ source, actor = 'system', terminalSNs = null } = {}) => {
  if (running) {
    const error = new Error('A reconciliation run is already in progress');
    error.statusCode = 409;
    throw error;
  }
  running = true;
  const config = getSyncConfig();
  const effectiveSource = source || config.reconcile.source;
  const runId = `rec-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 6)}`;
  try {
    const filter = { enabled: { $ne: false } };
    if (terminalSNs?.length) filter.deviceSN = { $in: terminalSNs };
    const terminals = await TerminalConfig.find(filter).lean();
    const index = await loadStudentIndex();

    // Eligible students without a PIN were never provisioned: provision them now.
    const { enqueueProvision } = require('./terminalSyncService');
    const unprovisioned = await Student.find({
      isActive: true,
      accessStatus: { $ne: 'blocked' },
      $or: [{ zktUserID: null }, { zktUserID: { $exists: false } }],
    })
      .select('_id')
      .lean();
    for (const student of unprovisioned) {
      await enqueueProvision(student._id, { actor, reason: 'reconcile_unprovisioned' });
    }

    const limit = createLimiter(effectiveSource === 'sidecar' ? config.sidecar.concurrency : 4);
    const reports = await Promise.all(
      terminals.map((terminal) => limit(() => reconcileTerminal({ terminal, runId, source: effectiveSource, index })))
    );

    const summary = {
      runId,
      source: effectiveSource,
      terminals: reports.length,
      ok: reports.filter((r) => r.status === 'ok').length,
      drift: reports.filter((r) => r.status === 'drift').length,
      errors: reports.filter((r) => r.status === 'error').length,
      pendingQuery: reports.filter((r) => r.status === 'pending_query').length,
      blockedPresent: reports.reduce((n, r) => n + r.blockedPresent.length, 0),
      queued: reports.reduce((n, r) => n + r.queued, 0),
      unprovisioned: unprovisioned.length,
    };
    await recordBiometricAudit({ actor, action: 'reconcile', details: summary });
    emitSyncReconcile(summary);
    return summary;
  } finally {
    running = false;
  }
};

module.exports = { diffTerminal, desiredPinsFor, runReconciliation, reconcileTerminal };
