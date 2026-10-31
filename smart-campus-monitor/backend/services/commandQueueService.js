const TerminalCommand = require('../models/TerminalCommand');
const TerminalConfig = require('../models/TerminalConfig');
const TerminalUserState = require('../models/TerminalUserState');
const BiometricTemplate = require('../models/BiometricTemplate');
const BiometricAuditLog = require('../models/BiometricAuditLog');
const AlertLog = require('../models/AlertLog');
const { getBiometricConfig } = require('../config/biometricConfig');
const { decryptTemplate } = require('./templateCrypto');
const {
  computeTemplateSize,
  effectiveDialect,
  getDialectAdapter,
  redactCommandText,
  resolveDialectFromProbes,
} = require('./adms/dialects');
const { emitCommandStatus } = require('./socketService');

// Higher is sent first. createUser outranks writeTemplate so a user always precedes its template.
const PRIORITY = {
  probe: 100,
  deleteUser: 50,
  createUser: 10,
  writeTemplate: 9,
  queryUser: 1,
  queryTemplate: 1,
};

// Commands that a new command of the given type makes obsolete while they are still pending.
const SUPERSEDES = {
  deleteUser: ['createUser', 'writeTemplate'],
  createUser: ['deleteUser'],
  writeTemplate: ['deleteUser'],
};

const AUDIT_ACTION = {
  createUser: 'user_create',
  writeTemplate: 'template_write',
  deleteUser: 'user_delete',
};

const templateAad = (studentId, fingerIndex) => `${studentId}:${fingerIndex}`;

const defaultDedupeKey = (type, params = {}) => {
  if (type === 'writeTemplate' || type === 'queryTemplate') {
    return `${type}:${params.fingerIndex}`;
  }

  if (type === 'probe') {
    return `probe:${params.dialect}`;
  }

  return type;
};

const isDuplicateKeyError = (error) => Number(error?.code) === 11000;

const notify = (command) =>
  emitCommandStatus({
    id: String(command._id),
    terminalSN: command.terminalSN,
    cmdId: command.cmdId,
    type: command.type,
    status: command.status,
    returnCode: command.returnCode,
    student: command.student ? String(command.student) : null,
  });

const raiseSyncAlert = (command, reason) =>
  AlertLog.create({
    type: 'sync_failed',
    message: `Terminal ${command.terminalSN}: ${command.type} failed (${reason})`,
    metadata: {
      terminalSN: command.terminalSN,
      cmdId: command.cmdId,
      type: command.type,
      student: command.student,
      returnCode: command.returnCode,
      attempts: command.attempts,
    },
  });

const allocateCmdId = async (terminalSN) => {
  const terminal = await TerminalConfig.findOneAndUpdate(
    { deviceSN: terminalSN },
    { $inc: { nextCmdId: 1 } },
    { new: true, projection: { nextCmdId: 1 } }
  ).lean();

  if (!terminal) {
    throw new Error(`Terminal ${terminalSN} is not registered`);
  }

  return terminal.nextCmdId;
};

// Idempotent: an open command with the same (terminal, student, dedupeKey) is reused.
const enqueueCommand = async ({
  terminalSN,
  type,
  params = {},
  student = null,
  dedupeKey,
  priority,
  jobId = '',
}) => {
  const key = dedupeKey || defaultDedupeKey(type, params);
  const studentId = student?._id || student || null;

  if (studentId && SUPERSEDES[type]) {
    const superseded = await TerminalCommand.find({
      terminalSN,
      student: studentId,
      type: { $in: SUPERSEDES[type] },
      status: 'pending',
    });

    for (const command of superseded) {
      command.status = 'superseded';
      command.lastError = `Superseded by ${type}`;
      await command.save();
      notify(command);
    }
  }

  const existing = await TerminalCommand.findOne({
    terminalSN,
    student: studentId,
    dedupeKey: key,
    open: true,
  });

  if (existing) {
    // Latest arguments win while the command has not left the server.
    if (existing.status === 'pending') {
      existing.params = params;
      existing.jobId = jobId || existing.jobId;
      existing.markModified('params');
      await existing.save();
    }

    return { command: existing, created: false };
  }

  const cmdId = await allocateCmdId(terminalSN);

  try {
    const command = await TerminalCommand.create({
      terminalSN,
      cmdId,
      type,
      params,
      student: studentId,
      dedupeKey: key,
      priority: priority ?? PRIORITY[type] ?? 0,
      jobId,
    });

    notify(command);
    return { command, created: true };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const raced = await TerminalCommand.findOne({
      terminalSN,
      student: studentId,
      dedupeKey: key,
      open: true,
    });

    return { command: raced, created: false };
  }
};

// Sequential so the classic probe always has the lower cmdId and goes out first.
const enqueueDialectProbes = async (terminal, config = getBiometricConfig()) => {
  const results = [];

  for (const dialect of ['classic', 'v3']) {
    results.push(
      await enqueueCommand({
        terminalSN: terminal.deviceSN,
        type: 'probe',
        params: { dialect, pin: config.adms.probePin },
      })
    );
  }

  return results;
};

const renderCommand = async (command, dialect, config) => {
  const adapter = getDialectAdapter(command.type === 'probe' ? command.params.dialect : dialect);

  if (command.type !== 'writeTemplate') {
    const builder = command.type === 'probe' ? adapter.probe : adapter[command.type];
    const text = builder(command.params, config);
    return { text, textRedacted: text };
  }

  const template = await BiometricTemplate.findById(command.params.templateId).select('+dataEncrypted');

  if (!template) {
    throw new Error('Template no longer exists');
  }

  const bytes = decryptTemplate(template.dataEncrypted, templateAad(template.student, template.fingerIndex));
  const templateBase64 = bytes.toString('base64');
  const text = adapter.writeTemplate(
    {
      pin: command.params.pin,
      fingerIndex: template.fingerIndex,
      flag: template.flag,
      templateBase64,
      size: computeTemplateSize(
        { sizeReported: template.sizeReported, byteLength: template.byteLength, templateBase64 },
        config
      ),
    },
    config
  );

  return { text, textRedacted: redactCommandText(text, template.sha256) };
};

// Claims up to `limit` pending commands for one poll. Each claim is atomic, so two
// overlapping polls never send the same command twice.
const claimNextCommands = async (terminal, { now = new Date(), limit } = {}) => {
  const config = getBiometricConfig();
  const max = limit || config.adms.maxCommandsPerPoll;
  const dialect = effectiveDialect(terminal, config);
  const filter = { terminalSN: terminal.deviceSN, status: 'pending' };

  if (!dialect) {
    filter.type = 'probe';
  }

  const candidates = await TerminalCommand.find(filter)
    .sort({ priority: -1, cmdId: 1 })
    .limit(max * 3)
    .select('_id');
  const claimed = [];

  for (const candidate of candidates) {
    if (claimed.length >= max) {
      break;
    }

    const command = await TerminalCommand.findOneAndUpdate(
      { _id: candidate._id, status: 'pending' },
      { $set: { status: 'sent', open: true, sentAt: now, dialect: dialect || '' }, $inc: { attempts: 1 } },
      { new: true }
    );

    if (!command) {
      continue;
    }

    try {
      const { text, textRedacted } = await renderCommand(command, dialect, config);
      command.textRedacted = textRedacted;
      await command.save();
      claimed.push({ cmdId: command.cmdId, text });
      notify(command);
    } catch (error) {
      command.status = 'failed';
      command.lastError = error.message;
      await command.save();
      notify(command);
      await raiseSyncAlert(command, error.message);
    }
  }

  return claimed;
};

const formatPollResponse = (claimed) =>
  claimed.length ? claimed.map(({ cmdId, text }) => `C:${cmdId}:${text}`).join('\n') : 'OK';

const applyUserState = async (command, now) => {
  if (!command.student) {
    return;
  }

  const filter = { student: command.student, terminalSN: command.terminalSN };
  const options = { upsert: true };

  if (command.type === 'createUser') {
    await TerminalUserState.updateOne(
      filter,
      { $set: { present: true, lastConfirmedAt: now, source: 'ack' } },
      options
    );
  } else if (command.type === 'writeTemplate') {
    await TerminalUserState.updateOne(
      filter,
      {
        $set: { present: true, lastConfirmedAt: now, source: 'ack' },
        $addToSet: { fingerIndexes: command.params.fingerIndex },
      },
      options
    );
  } else if (command.type === 'deleteUser') {
    await TerminalUserState.updateOne(
      filter,
      { $set: { present: false, fingerIndexes: [], lastConfirmedAt: now, source: 'ack' } },
      options
    );
  }
};

const applyProbeResult = async (command, returnCode, now) => {
  const field = command.params.dialect === 'v3' ? 'dialectProbe.v3Return' : 'dialectProbe.classicReturn';
  const terminal = await TerminalConfig.findOneAndUpdate(
    { deviceSN: command.terminalSN },
    { $set: { [field]: returnCode, 'dialectProbe.probedAt': now } },
    { new: true }
  );

  if (!terminal) {
    return null;
  }

  const resolved = resolveDialectFromProbes(terminal.dialectProbe || {});

  if (resolved !== 'unknown' && terminal.dialect !== resolved) {
    terminal.dialect = resolved;
    await terminal.save();
    console.info(`Terminal ${terminal.deviceSN}: dialect detected as ${resolved}`);
  }

  return resolved;
};

const recordAck = async ({ terminalSN, cmdId, returnCode, now = new Date() }) => {
  const config = getBiometricConfig();
  const command = await TerminalCommand.findOne({ terminalSN, cmdId: Number(cmdId) });

  if (!command) {
    return { matched: false };
  }

  if (!command.open) {
    // Duplicate ack for a command already settled.
    return { matched: true, command, duplicate: true };
  }

  const code = Number(returnCode);
  command.returnCode = Number.isFinite(code) ? code : null;
  command.ackedAt = now;

  const missingUserOk = command.type === 'deleteUser' && config.adms.deleteMissingOkCodes.includes(code);
  let outcome;

  if (command.type === 'probe') {
    outcome = 'acked';
  } else if (code === 0 || missingUserOk) {
    outcome = 'acked';
  } else if (config.adms.permanentFailureCodes.includes(code)) {
    outcome = 'failed';
  } else if (command.attempts >= config.queue.maxAttempts) {
    outcome = 'failed';
  } else {
    outcome = 'pending';
  }

  command.status = outcome;
  command.lastError = outcome === 'acked' ? '' : `Return=${returnCode}`;
  await command.save();
  notify(command);

  let dialect = null;

  if (command.type === 'probe') {
    dialect = await applyProbeResult(command, command.returnCode, now);
  } else if (outcome === 'acked') {
    await applyUserState(command, now);
  }

  if (AUDIT_ACTION[command.type] && outcome !== 'pending') {
    await BiometricAuditLog.create({
      actorType: 'terminal',
      action: AUDIT_ACTION[command.type],
      student: command.student,
      terminal: terminalSN,
      result: outcome === 'acked' ? 'success' : 'failure',
      detail: { cmdId: command.cmdId, returnCode: command.returnCode },
      timestamp: now,
    });
  }

  if (outcome === 'failed') {
    await raiseSyncAlert(command, command.lastError);
  }

  return { matched: true, command, outcome, dialect };
};

// Sent commands with no ack after the timeout go back to pending, or fail after max attempts.
const requeueTimedOut = async ({ now = new Date() } = {}) => {
  const config = getBiometricConfig();
  const cutoff = new Date(now.getTime() - config.queue.ackTimeoutMs);
  const stale = await TerminalCommand.find({ status: 'sent', sentAt: { $lt: cutoff } });
  const result = { requeued: 0, failed: 0 };

  for (const command of stale) {
    if (command.attempts >= config.queue.maxAttempts) {
      command.status = 'failed';
      command.lastError = `No ack after ${command.attempts} attempts`;
      result.failed += 1;
      await command.save();
      await raiseSyncAlert(command, command.lastError);
    } else {
      command.status = 'pending';
      command.lastError = 'Ack timeout, will resend';
      result.requeued += 1;
      await command.save();
    }

    notify(command);
  }

  return result;
};

// Moves failed commands back to pending with a fresh attempt budget (admin retry).
const retryFailedCommands = async (filter = {}) => {
  const failed = await TerminalCommand.find({ ...filter, status: 'failed' });
  let retried = 0;

  for (const command of failed) {
    command.status = 'pending';
    command.attempts = 0;
    command.lastError = '';

    try {
      await command.save();
      retried += 1;
      notify(command);
    } catch (error) {
      // An equivalent command is already open; this one stays failed.
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  return { retried };
};

module.exports = {
  PRIORITY,
  claimNextCommands,
  enqueueCommand,
  enqueueDialectProbes,
  formatPollResponse,
  recordAck,
  requeueTimedOut,
  retryFailedCommands,
  templateAad,
};
