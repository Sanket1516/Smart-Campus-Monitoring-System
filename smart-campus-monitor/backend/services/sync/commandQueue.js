/**
 * MongoDB-backed per-terminal command queue for ADMS push.
 *
 * Guarantees:
 *  - Commands survive server/terminal restarts (all state in MongoDB).
 *  - No duplicate open command per (terminal, student, dedupeKey) — enforced by a
 *    partial unique index, so concurrent enqueues are safe.
 *  - Resend after SYNC_ACK_TIMEOUT_MIN without an ack, at most SYNC_MAX_ATTEMPTS,
 *    then the command is marked failed and an alert is raised.
 */
const TerminalCommand = require('../../models/TerminalCommand');
const TerminalConfig = require('../../models/TerminalConfig');
const TerminalUserState = require('../../models/TerminalUserState');
const AlertLog = require('../../models/AlertLog');
const { getSyncConfig } = require('../../config/terminalSync');
const { getDialect, resolveDialectName } = require('../adms/dialects');
const { describeReturnCode } = require('../adms/protocol');
const { loadTemplateValue } = require('./templateStore');
const { emitSyncCommand, emitSyncAlert } = require('../socketService');

const PRIORITY = {
  PROBE: 0,
  USER_DELETE: 10,
  USER_CREATE: 50,
  TEMPLATE_WRITE: 60,
  ENROLL_FP: 70,
  USER_QUERY: 80,
  TEMPLATE_QUERY: 80,
  USER_QUERY_ALL: 90,
};

const isDuplicateKey = (error) => Number(error?.code) === 11000;

const commandSummary = (command) => ({
  id: String(command._id),
  terminalSN: command.terminalSN,
  cmdId: command.cmdId,
  type: command.type,
  status: command.status,
  attempts: command.attempts,
  returnCode: command.returnCode,
  lastError: command.lastError,
  student: command.student ? String(command.student) : null,
  pin: command.pin,
  jobId: command.jobId,
  updatedAt: command.updatedAt || new Date(),
});

const allocateCmdId = async (terminalSN) => {
  const terminal = await TerminalConfig.findOneAndUpdate(
    { deviceSN: terminalSN },
    { $inc: { nextCmdId: 1 } },
    { new: false, projection: { nextCmdId: 1 } }
  ).lean();
  if (!terminal) throw new Error(`Terminal ${terminalSN} is not registered`);
  return terminal.nextCmdId || 1;
};

/** Text stored in the DB. TEMPLATE_WRITE never stores the template itself. */
const buildStoredText = (dialect, type, params) => {
  switch (type) {
    case 'USER_CREATE':
      return dialect.createUser(params);
    case 'USER_DELETE':
      return dialect.deleteUser(params);
    case 'USER_QUERY':
      return dialect.queryUser(params);
    case 'USER_QUERY_ALL':
      return dialect.queryAllUsers(params);
    case 'TEMPLATE_QUERY':
      return dialect.queryTemplate(params);
    case 'ENROLL_FP':
      return dialect.enrollFingerprint(params);
    case 'PROBE':
      return dialect.probe(params);
    case 'TEMPLATE_WRITE': {
      // Build with a placeholder to validate params, then redact.
      const placeholder = 'AA==';
      const text = dialect.writeTemplate({ ...params, template: placeholder, size: params.size ?? 0 });
      return text.replace(/(TMP|Tmp)=AA==$/, `$1=<redacted sha256:${String(params.sha256 || '').slice(0, 12)}>`);
    }
    default:
      throw new Error(`Unknown command type ${type}`);
  }
};

/**
 * Enqueue a command. Idempotent: if an equivalent open command exists, it is returned
 * (and its text refreshed while still pending).
 */
const enqueueCommand = async ({
  terminal,
  type,
  student = null,
  pin = '',
  params = {},
  templateRef = null,
  dedupeSuffix = '',
  jobId = '',
  dialectName,
}) => {
  const terminalSN = terminal.deviceSN || terminal.terminalSN || terminal;
  const dialectToUse = dialectName || resolveDialectName(terminal);
  const dialect = getDialect(dialectToUse);
  const text = buildStoredText(dialect, type, params);
  const dedupeKey = dedupeSuffix ? `${type}:${dedupeSuffix}` : type;
  const studentId = student?._id || student || null;

  const existing = await TerminalCommand.findOne({
    terminalSN,
    student: studentId,
    dedupeKey,
    open: true,
  });
  if (existing) {
    if (existing.status === 'pending' && (existing.text !== text || String(existing.templateRef) !== String(templateRef))) {
      existing.text = text;
      existing.params = params;
      existing.templateRef = templateRef;
      existing.dialect = dialectToUse;
      await existing.save();
    }
    return { command: existing, created: false };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const cmdId = await allocateCmdId(terminalSN);
    try {
      const command = await TerminalCommand.create({
        terminalSN,
        cmdId,
        type,
        dialect: dialectToUse,
        text,
        params,
        templateRef,
        dedupeKey,
        student: studentId,
        pin: String(pin || params.pin || ''),
        jobId,
        priority: PRIORITY[type] ?? 100,
      });
      emitSyncCommand(commandSummary(command));
      return { command, created: true };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      if (error.keyPattern?.dedupeKey || String(error.message).includes('uniq_open_command')) {
        const raced = await TerminalCommand.findOne({ terminalSN, student: studentId, dedupeKey, open: true });
        if (raced) return { command: raced, created: false };
      }
      // cmdId collision (should not happen) — allocate again.
    }
  }
  throw new Error(`Could not enqueue ${type} for terminal ${terminalSN}`);
};

/** Cancel open commands of the given types for a student on a terminal (or all terminals). */
const cancelOpenCommands = async ({ student, types, terminalSN = null, reason = 'superseded' }) => {
  const filter = { student: student._id || student, type: { $in: types }, open: true };
  if (terminalSN) filter.terminalSN = terminalSN;
  const result = await TerminalCommand.updateMany(filter, {
    $set: { status: 'cancelled', open: false, lastError: reason },
  });
  return result.modifiedCount || 0;
};

/** Render the exact text sent to the terminal (fills in template data at send time). */
const renderForSend = async (command) => (await renderWithMeta(command)).text;

/** Rendered text plus non-secret metadata (finger, size, SHA-256) for logs. */
const renderWithMeta = async (command) => {
  if (command.type !== 'TEMPLATE_WRITE') return { text: command.text, meta: {} };
  const template = await loadTemplateValue(command.templateRef);
  if (!template) throw new Error('Referenced template no longer exists');
  const dialect = getDialect(command.dialect);
  const text = dialect.writeTemplate({
    ...command.params,
    fingerIndex: template.fingerIndex,
    flag: template.flag,
    template: template.value,
    size: undefined,
  });
  return {
    text,
    meta: { fingerIndex: template.fingerIndex, sha256: template.sha256, sizeBytes: template.sizeBytes, sizeBase64: template.sizeBase64 },
  };
};

/**
 * Pick the next commands for a terminal poll and mark them "sent".
 * Returns [{cmdId, text}] with fully rendered text.
 */
const takeNextCommands = async (terminalSN, { max, strictOrder, now = new Date() } = {}) => {
  const { adms, queue } = getSyncConfig();
  const limit = max ?? adms.maxCommandsPerPoll;
  const strict = strictOrder ?? adms.strictOrder;

  if (strict) {
    const timeoutAt = new Date(now.getTime() - queue.ackTimeoutMinutes * 60 * 1000);
    const inFlight = await TerminalCommand.exists({ terminalSN, status: 'sent', sentAt: { $gt: timeoutAt } });
    if (inFlight) return [];
  }

  const candidates = await TerminalCommand.find({ terminalSN, status: 'pending' })
    .sort({ priority: 1, cmdId: 1 })
    .limit(limit);

  const out = [];
  for (const candidate of candidates) {
    const claimed = await TerminalCommand.findOneAndUpdate(
      { _id: candidate._id, status: 'pending' },
      { $set: { status: 'sent', sentAt: now }, $inc: { attempts: 1 } },
      { new: true }
    );
    if (!claimed) continue;
    try {
      const { text, meta } = await renderWithMeta(claimed);
      out.push({ cmdId: claimed.cmdId, text, type: claimed.type, id: String(claimed._id), pin: claimed.pin, attempts: claimed.attempts, meta });
      emitSyncCommand(commandSummary(claimed));
    } catch (error) {
      claimed.status = 'failed';
      claimed.open = false;
      claimed.lastError = error.message;
      await claimed.save();
      await raiseCommandAlert(claimed, error.message);
    }
  }
  return out;
};

const raiseCommandAlert = async (command, reason) => {
  if (command.alertRaised) return;
  command.alertRaised = true;
  await TerminalCommand.updateOne({ _id: command._id }, { $set: { alertRaised: true } });
  const message = `Terminal command ${command.type} #${command.cmdId} failed on ${command.terminalSN}: ${reason}`;
  try {
    await AlertLog.create({
      type: 'sync_failed',
      message,
      metadata: {
        terminalSN: command.terminalSN,
        cmdId: command.cmdId,
        type: command.type,
        pin: command.pin,
        student: command.student,
        returnCode: command.returnCode,
      },
    });
  } catch (error) {
    console.error('[queue] alert write failed:', error.message);
  }
  emitSyncAlert({ message, ...commandSummary(command) });
};

const upsertUserState = async ({ terminalSN, pin, student, present, fingerIndex, source }) => {
  if (!pin) return;
  const update = {
    $set: { present, lastConfirmedAt: new Date(), source, ...(student ? { student } : {}) },
  };
  if (!present) update.$set.fingers = [];
  else if (fingerIndex !== undefined && fingerIndex !== null) update.$addToSet = { fingers: fingerIndex };
  await TerminalUserState.updateOne({ terminalSN, pin: String(pin) }, update, { upsert: true });
};

/**
 * Apply an acknowledgement from POST /iclock/devicecmd.
 * Returns { command, success, duplicate, unknown }.
 */
const applyAck = async ({ terminalSN, id, returnCode, now = new Date() }) => {
  const command = await TerminalCommand.findOne({ terminalSN, cmdId: id });
  if (!command) return { unknown: true };
  if (command.status === 'acked') return { command, duplicate: true, success: true };

  const { adms } = getSyncConfig();
  const ok =
    returnCode === 0 || (command.type === 'USER_DELETE' && adms.deleteMissingCodes.includes(returnCode));

  command.returnCode = returnCode;
  command.ackedAt = now;
  command.open = false;

  if (command.type === 'PROBE') {
    // A probe "fails" by design when the dialect is wrong; dialect detection handles it.
    command.status = 'acked';
    command.lastError = returnCode === 0 ? '' : describeReturnCode(returnCode);
    await command.save();
    emitSyncCommand(commandSummary(command));
    return { command, success: returnCode === 0 };
  }

  if (ok) {
    command.status = 'acked';
    command.lastError = '';
  } else {
    command.status = 'failed';
    command.lastError = `terminal returned ${returnCode} (${describeReturnCode(returnCode)})`;
  }
  await command.save();

  if (ok) {
    if (command.type === 'USER_CREATE') {
      await upsertUserState({ terminalSN, pin: command.pin, student: command.student, present: true, source: 'ack' });
    } else if (command.type === 'TEMPLATE_WRITE') {
      await upsertUserState({
        terminalSN,
        pin: command.pin,
        student: command.student,
        present: true,
        fingerIndex: command.params?.fingerIndex,
        source: 'ack',
      });
    } else if (command.type === 'USER_DELETE') {
      await upsertUserState({ terminalSN, pin: command.pin, student: command.student, present: false, source: 'ack' });
    }
    await TerminalConfig.updateOne({ deviceSN: terminalSN }, { $set: { lastSyncAt: now } });
  } else {
    await raiseCommandAlert(command, command.lastError);
  }

  emitSyncCommand(commandSummary(command));
  return { command, success: ok };
};

/** Resend timed-out commands; fail them after the maximum number of attempts. */
const sweepTimeouts = async (now = new Date()) => {
  const { queue } = getSyncConfig();
  const timeoutAt = new Date(now.getTime() - queue.ackTimeoutMinutes * 60 * 1000);
  const stale = await TerminalCommand.find({ status: 'sent', sentAt: { $lte: timeoutAt } });
  let requeued = 0;
  let failed = 0;
  for (const command of stale) {
    if (command.attempts < queue.maxAttempts) {
      const result = await TerminalCommand.updateOne(
        { _id: command._id, status: 'sent' },
        { $set: { status: 'pending', lastError: `no ack after ${queue.ackTimeoutMinutes} min, resending` } }
      );
      if (result.modifiedCount) requeued += 1;
    } else {
      const result = await TerminalCommand.updateOne(
        { _id: command._id, status: 'sent' },
        { $set: { status: 'failed', open: false, lastError: `no ack after ${command.attempts} attempts` } }
      );
      if (result.modifiedCount) {
        failed += 1;
        command.status = 'failed';
        command.lastError = `no ack after ${command.attempts} attempts`;
        await raiseCommandAlert(command, command.lastError);
      }
    }
  }
  return { requeued, failed };
};

/** Put failed commands back in the queue (attempts reset). Skips ones superseded by a newer open command. */
const retryFailedCommands = async (filter = {}) => {
  const failed = await TerminalCommand.find({ ...filter, status: 'failed' });
  let retried = 0;
  let skipped = 0;
  for (const command of failed) {
    try {
      const result = await TerminalCommand.updateOne(
        { _id: command._id, status: 'failed' },
        {
          $set: { status: 'pending', open: true, attempts: 0, sentAt: null, alertRaised: false, lastError: 'manual retry' },
        }
      );
      if (result.modifiedCount) retried += 1;
    } catch (error) {
      if (isDuplicateKey(error)) skipped += 1;
      else throw error;
    }
  }
  return { retried, skipped };
};

const countsByTerminal = async () => {
  const rows = await TerminalCommand.aggregate([
    { $match: { status: { $in: ['pending', 'sent', 'failed'] } } },
    { $group: { _id: { sn: '$terminalSN', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const map = {};
  rows.forEach(({ _id, count }) => {
    map[_id.sn] = map[_id.sn] || { pending: 0, sent: 0, failed: 0 };
    map[_id.sn][_id.status] = count;
  });
  return map;
};

module.exports = {
  PRIORITY,
  buildStoredText,
  enqueueCommand,
  cancelOpenCommands,
  renderForSend,
  takeNextCommands,
  applyAck,
  sweepTimeouts,
  retryFailedCommands,
  countsByTerminal,
  upsertUserState,
  commandSummary,
};
