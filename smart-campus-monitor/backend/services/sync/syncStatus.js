/**
 * Per-terminal template state and the student's overall gate-sync status.
 *
 * Per gate:  pending → stored (terminal ack Return=0) → verified (read-back SHA-256 match).
 * Overall:   FULLY_SYNCHRONIZED only when every target gate is *verified*;
 *            SYNCHRONIZED_UNVERIFIED when all gates acked but read-back is missing;
 *            PARTIALLY_SYNCHRONIZED when some gates are done and others are not.
 */
const Student = require('../../models/Student');
const TerminalConfig = require('../../models/TerminalConfig');
const TerminalCommand = require('../../models/TerminalCommand');
const TerminalUserState = require('../../models/TerminalUserState');
const BiometricTemplate = require('../../models/BiometricTemplate');
const { desiredTerminalsForStudent, isGateTerminal } = require('./groups');
const { emitSyncStudent } = require('../socketService');

const recordTemplateState = async ({ terminalSN, pin, student, fingerIndex, sha256, state, via }) => {
  if (!pin) return;
  const doc =
    (await TerminalUserState.findOne({ terminalSN, pin: String(pin) })) ||
    new TerminalUserState({ terminalSN, pin: String(pin), present: true, source: 'ack', student: student || null });
  const templates = (doc.templates || []).filter((t) => Number(t.fingerIndex) !== Number(fingerIndex));
  templates.push({ fingerIndex: Number(fingerIndex), sha256, state, via, at: new Date() });
  doc.templates = templates;
  doc.present = true;
  if (student) doc.student = student;
  const fingers = new Set([...(doc.fingers || []), Number(fingerIndex)]);
  doc.fingers = Array.from(fingers);
  doc.lastConfirmedAt = new Date();
  await doc.save();
};

const clearTemplateStates = (terminalSN, pin) =>
  TerminalUserState.updateOne({ terminalSN, pin: String(pin) }, { $set: { templates: [], fingers: [] } });

const gateStatusForEnrolled = (terminal, templates, state, commands) => {
  const failed = commands.find((c) => c.status === 'failed' && ['USER_CREATE', 'TEMPLATE_WRITE'].includes(c.type));
  if (failed) return { status: 'failed', detail: `${failed.type} #${failed.cmdId}: ${failed.lastError || 'failed'}` };
  if (templates.some((t) => t.simulated) && !terminal.simulated) {
    return { status: 'failed', detail: 'SIMULATED template is never sent to a real terminal; enrol on the real Device 1' };
  }
  const states = templates.map((template) => {
    const entry = (state?.templates || []).find((t) => Number(t.fingerIndex) === Number(template.fingerIndex));
    if (!entry || entry.sha256 !== template.sha256) return 'pending';
    return entry.state;
  });
  if (states.includes('mismatch')) return { status: 'failed', detail: 'read-back SHA-256 does not match the stored template' };
  if (states.every((s) => s === 'verified')) return { status: 'verified', detail: 'read-back matched' };
  if (states.every((s) => s === 'verified' || s === 'stored')) return { status: 'stored', detail: 'terminal acknowledged; read-back pending' };
  const pendingCmd = commands.find((c) => ['pending', 'sent'].includes(c.status));
  return { status: 'pending', detail: pendingCmd ? `${pendingCmd.type} ${pendingCmd.status}` : 'queued' };
};

const gateStatusForBlocked = (state, commands) => {
  const deletes = commands.filter((c) => c.type === 'USER_DELETE');
  const failed = deletes.find((c) => c.status === 'failed');
  if (failed) return { status: 'failed', detail: `USER_DELETE #${failed.cmdId}: ${failed.lastError || 'failed'}` };
  if (deletes.some((c) => ['pending', 'sent'].includes(c.status))) return { status: 'remove_pending', detail: 'delete queued' };
  if (state?.present) return { status: 'remove_pending', detail: 'still present on terminal' };
  return {
    status: 'removed',
    detail: state?.absenceVerifiedAt ? 'absence verified by read-back' : state ? 'delete acknowledged' : 'never present',
  };
};

const overallFor = (statuses) => {
  if (!statuses.length) return 'NO_TARGET_TERMINALS';
  const ok = statuses.filter((s) => s === 'verified' || s === 'stored');
  if (statuses.every((s) => s === 'verified')) return 'FULLY_SYNCHRONIZED';
  if (ok.length === statuses.length) return 'SYNCHRONIZED_UNVERIFIED';
  if (ok.length > 0) return 'PARTIALLY_SYNCHRONIZED';
  if (statuses.every((s) => s === 'failed')) return 'FAILED';
  return statuses.includes('failed') ? 'FAILED' : 'PENDING';
};

const recomputeStudentSyncStatus = async (studentId) => {
  const student = await Student.findById(studentId).lean();
  if (!student) return null;
  const terminals = await TerminalConfig.find({ enabled: { $ne: false } }).lean();
  const gates = terminals.filter(isGateTerminal);
  const states = await TerminalUserState.find({ student: student._id }).lean();
  const commands = await TerminalCommand.find({ student: student._id, status: { $in: ['pending', 'sent', 'failed'] } }).lean();
  const templates = await BiometricTemplate.find({ student: student._id, flag: { $ne: 0 } })
    .select('fingerIndex sha256 simulated')
    .lean();
  const blocked = student.accessStatus === 'blocked' || student.isActive === false;
  const desired = desiredTerminalsForStudent(student, terminals);

  const gateSync = [];
  let syncStatus;

  if (blocked) {
    const relevant = gates.filter(
      (t) =>
        desired.some((d) => d.deviceSN === t.deviceSN) ||
        states.some((s) => s.terminalSN === t.deviceSN) ||
        commands.some((c) => c.terminalSN === t.deviceSN)
    );
    relevant.forEach((terminal) => {
      const state = states.find((s) => s.terminalSN === terminal.deviceSN);
      const result = gateStatusForBlocked(state, commands.filter((c) => c.terminalSN === terminal.deviceSN));
      gateSync.push({ terminalSN: terminal.deviceSN, terminalLabel: terminal.terminalLabel, deviceRole: terminal.deviceRole, ...result, updatedAt: new Date() });
    });
    const statuses = gateSync.map((g) => g.status);
    syncStatus = statuses.includes('failed') ? 'FAILED' : statuses.every((s) => s === 'removed') ? 'BLOCKED_REMOVED' : 'BLOCK_PENDING';
  } else {
    desired.forEach((terminal) => {
      const state = states.find((s) => s.terminalSN === terminal.deviceSN);
      const cmds = commands.filter((c) => c.terminalSN === terminal.deviceSN);
      let result;
      if (!templates.length) {
        const failed = cmds.find((c) => c.status === 'failed');
        result = failed
          ? { status: 'failed', detail: `${failed.type}: ${failed.lastError}` }
          : state?.present
            ? { status: 'user_only', detail: 'user record present; no fingerprint yet' }
            : { status: 'pending', detail: 'user record queued' };
      } else {
        result = gateStatusForEnrolled(terminal, templates, state, cmds);
      }
      gateSync.push({ terminalSN: terminal.deviceSN, terminalLabel: terminal.terminalLabel, deviceRole: terminal.deviceRole, ...result, updatedAt: new Date() });
    });
    syncStatus = templates.length ? overallFor(gateSync.map((g) => g.status)) : 'NOT_ENROLLED';
  }

  const changed = student.syncStatus !== syncStatus || JSON.stringify((student.gateSync || []).map((g) => [g.terminalSN, g.status])) !== JSON.stringify(gateSync.map((g) => [g.terminalSN, g.status]));
  await Student.updateOne({ _id: student._id }, { $set: { syncStatus, gateSync, syncStatusUpdatedAt: new Date() } });
  if (changed) emitSyncStudent({ studentId: String(student._id), event: 'sync_status', syncStatus, gateSync });
  return { syncStatus, gateSync };
};

/** Fire-and-forget recompute used from hot paths (acks, uploads). */
const scheduleRecompute = (studentId) => {
  if (!studentId) return;
  recomputeStudentSyncStatus(studentId).catch((error) => console.error('[sync-status] recompute failed:', error.message));
};

module.exports = { recordTemplateState, clearTemplateStates, recomputeStudentSyncStatus, scheduleRecompute, overallFor };
