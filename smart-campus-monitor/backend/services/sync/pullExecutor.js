/**
 * Pull mode for terminals that cannot (or are configured not to) use ADMS push
 * (communicationProtocol = zk_tcp_pull). The same persistent queue is executed through
 * the sidecar over ZK TCP, and attendance is pulled and fed into the same punch pipeline.
 * Return codes reported to the queue: 0 success, -1 operation unsupported in pull mode,
 * and errors keep the command pending for retry (then failed after max attempts).
 */
const TerminalConfig = require('../../models/TerminalConfig');
const TerminalCommand = require('../../models/TerminalCommand');
const Student = require('../../models/Student');
const { getSyncConfig } = require('../../config/terminalSync');
const { getSidecar } = require('../sidecar');
const { takeNextCommands, applyAck, upsertUserState, raiseCommandAlert } = require('./commandQueue');
const { loadTemplateValue } = require('./templateStore');
const { acquireTerminalLock, releaseTerminalLock } = require('./terminalLock');
const { emitTerminalOnline, emitTerminalOffline } = require('../socketService');

const MAX_COMMANDS_PER_CYCLE = 25;

const executeCommand = async (sidecar, terminal, sent) => {
  const command = await TerminalCommand.findById(sent.id).lean();
  const ip = terminal.terminalIP;
  switch (command.type) {
    case 'USER_CREATE':
      await sidecar.upsertUser(ip, { user_id: command.pin, name: String(command.params?.name || '').slice(0, 24), privilege: 0, templates: [] });
      return 0;
    case 'TEMPLATE_WRITE': {
      const template = await loadTemplateValue(command.templateRef);
      if (!template) throw new Error('referenced template no longer exists');
      const student = command.student ? await Student.findById(command.student).select('name').lean() : null;
      await sidecar.upsertUser(ip, {
        user_id: command.pin,
        name: String(student?.name || '').slice(0, 24),
        privilege: 0,
        templates: [{ fid: template.fingerIndex, valid: template.flag, template: template.value }],
      });
      return 0;
    }
    case 'USER_DELETE':
      await sidecar.deleteUser(ip, command.pin); // deleted:false = already absent → idempotent success
      return 0;
    case 'USER_QUERY':
    case 'USER_QUERY_ALL': {
      const { users = [] } = (await sidecar.getUsers(ip)) || {};
      for (const user of users) {
        if (command.type === 'USER_QUERY' && String(user.user_id) !== String(command.pin)) continue;
        await upsertUserState({ terminalSN: terminal.deviceSN, pin: String(user.user_id), present: true, source: 'audit' });
      }
      return 0;
    }
    case 'TEMPLATE_QUERY': {
      const { sidecarReadback } = require('./verification');
      const outcome = await sidecarReadback(terminal, command);
      return outcome === 'error' ? -2 : 0;
    }
    default:
      // PROBE (dialects are a push concept) and ENROLL_FP are not executed in pull mode.
      return -1;
  }
};

const pullAttendance = async (sidecar, terminal) => {
  const since = terminal.lastAttendancePullAt
    ? new Date(terminal.lastAttendancePullAt.getTime() + getSyncConfig().adms.deviceUtcOffsetMinutes * 60000 - 3600 * 1000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19)
    : undefined;
  const { records = [] } = (await sidecar.getAttendance(terminal.terminalIP, { since })) || {};
  const { ingestPunches } = require('../adms/admsService');
  // The scan pipeline updates the terminal document (counters, lastSeen): pass a full document.
  const terminalDoc = await TerminalConfig.findById(terminal._id);
  const result = await ingestPunches(
    terminalDoc,
    records.map((r) => ({ pin: String(r.user_id), time: r.timestamp, status: String(r.status ?? ''), verify: String(r.punch ?? ''), workcode: '', extra: [] })),
    { source: 'zk_tcp_pull' }
  );
  await TerminalConfig.updateOne({ _id: terminal._id }, { $set: { lastAttendancePullAt: new Date() } });
  return result;
};

const runPullCycleForTerminal = async (terminal) => {
  const sidecar = getSidecar();
  if (!sidecar) return { skipped: 'no sidecar configured' };
  if (!terminal.terminalIP) return { skipped: 'no IP' };
  const token = await acquireTerminalLock(terminal.deviceSN, { ttlMs: 10 * 60 * 1000 });
  if (!token) return { skipped: 'busy' };
  const summary = { executed: 0, failed: 0, punches: null };
  try {
    try {
      const info = await sidecar.info(terminal.terminalIP);
      const update = { isOnline: true, status: 'online', lastSeen: new Date() };
      if (info?.firmware) update.firmware = String(info.firmware).slice(0, 64);
      if (info?.algorithm) update.algorithmVersion = String(info.algorithm).slice(0, 32);
      await TerminalConfig.updateOne({ _id: terminal._id }, { $set: update });
      if (!terminal.isOnline) emitTerminalOnline({ deviceSN: terminal.deviceSN, terminalLabel: terminal.terminalLabel });
    } catch (error) {
      await TerminalConfig.updateOne({ _id: terminal._id }, { $set: { isOnline: false, status: 'offline' } });
      if (terminal.isOnline) emitTerminalOffline({ deviceSN: terminal.deviceSN, terminalLabel: terminal.terminalLabel, lastSeen: terminal.lastSeen });
      return { offline: true, error: error.message };
    }

    const sent = await takeNextCommands(terminal.deviceSN, { max: MAX_COMMANDS_PER_CYCLE, strictOrder: false });
    for (const item of sent) {
      try {
        const returnCode = await executeCommand(sidecar, terminal, item);
        await applyAck({ terminalSN: terminal.deviceSN, id: item.cmdId, returnCode });
        summary.executed += 1;
      } catch (error) {
        summary.failed += 1;
        const command = await TerminalCommand.findById(item.id);
        const exhausted = command.attempts >= getSyncConfig().queue.maxAttempts;
        command.status = exhausted ? 'failed' : 'pending';
        command.open = !exhausted;
        command.lastError = `sidecar: ${error.message}`;
        await command.save();
        if (exhausted) await raiseCommandAlert(command, command.lastError);
        break; // keep order: stop this cycle on the first device error
      }
    }
    summary.punches = await pullAttendance(sidecar, terminal);
    return summary;
  } finally {
    await releaseTerminalLock(terminal.deviceSN, token);
  }
};

const runPullCycle = async () => {
  const terminals = await TerminalConfig.find({ enabled: { $ne: false }, communicationProtocol: 'zk_tcp_pull' }).lean();
  const results = {};
  for (const terminal of terminals) {
    if (terminal.simulated && !getSyncConfig().simulationMode) continue;
    try {
      results[terminal.deviceSN] = await runPullCycleForTerminal(terminal);
    } catch (error) {
      results[terminal.deviceSN] = { error: error.message };
    }
  }
  return results;
};

module.exports = { runPullCycle, runPullCycleForTerminal, executeCommand };
