/**
 * Read-back verification of terminal state.
 *
 *  - via sidecar (ZK TCP): read the user's templates and compare SHA-256 with the stored copy;
 *    read the user list to confirm a delete.
 *  - via push: queue a template query (UNVERIFIED that the X990 answers); a template the gate
 *    uploads is compared with the stored copy.
 * A mismatch is an error and raises an alert. Nothing is marked verified without a real
 * comparison against data read back from the terminal.
 */
const BiometricTemplate = require('../../models/BiometricTemplate');
const TerminalConfig = require('../../models/TerminalConfig');
const TerminalUserState = require('../../models/TerminalUserState');
const AlertLog = require('../../models/AlertLog');
const { getSyncConfig } = require('../../config/terminalSync');
const { getSidecar } = require('../sidecar');
const { sha256Hex } = require('./templateCrypto');
const { recordTemplateState, scheduleRecompute } = require('./syncStatus');
const { recordBiometricAudit } = require('./biometricAudit');
const { emitSyncAlert } = require('../socketService');
const { isUsable } = require('../terminals/terminalAdapters');

const canUseSidecar = (terminal) =>
  getSyncConfig().verification.sidecarReadback &&
  Boolean(getSidecar()) &&
  Boolean(terminal?.terminalIP) &&
  isUsable(terminal, 'template_readback_sidecar');

const mismatchAlert = async (terminalSN, pin, fingerIndex) => {
  const message = `Read-back mismatch: PIN ${pin} finger ${fingerIndex} on ${terminalSN} differs from the stored template`;
  try {
    await AlertLog.create({ type: 'sync_failed', message, metadata: { terminalSN, pin, fingerIndex } });
  } catch (_error) {
    /* ignore */
  }
  emitSyncAlert({ message, terminalSN, pin });
};

/** Compare a template read back from a gate with the stored one. */
const compareReadback = async ({ terminalSN, pin, student, fingerIndex, readbackSha, via }) => {
  const stored = await BiometricTemplate.findOne({ student, fingerIndex }).select('sha256').lean();
  if (!stored) return 'no_stored_template';
  const state = stored.sha256 === readbackSha ? 'verified' : 'mismatch';
  await recordTemplateState({ terminalSN, pin, student, fingerIndex, sha256: stored.sha256, state, via });
  await recordBiometricAudit({
    actor: via === 'sidecar_readback' ? 'sidecar' : `terminal:${terminalSN}`,
    action: 'template_read',
    student,
    terminal: terminalSN,
    result: state,
    details: { fingerIndex, via, sha256: readbackSha },
  });
  if (state === 'mismatch') await mismatchAlert(terminalSN, pin, fingerIndex);
  scheduleRecompute(student);
  return state;
};

const sidecarReadback = async (terminal, command) => {
  const sidecar = getSidecar();
  const pin = command.pin;
  try {
    const { templates = [] } = (await sidecar.getTemplates(terminal.terminalIP, { userId: pin })) || {};
    const fingerIndex = Number(command.params?.fingerIndex);
    const match = templates.find((t) => Number(t.fid) === fingerIndex);
    if (!match) {
      await recordBiometricAudit({ actor: 'sidecar', action: 'template_read', student: command.student, terminal: terminal.deviceSN, result: 'not_found', details: { fingerIndex } });
      return 'not_found';
    }
    const sha = match.sha256 || sha256Hex(Buffer.from(match.template, 'base64'));
    return compareReadback({ terminalSN: terminal.deviceSN, pin, student: command.student, fingerIndex, readbackSha: sha, via: 'sidecar_readback' });
  } catch (error) {
    console.warn(`[verify] sidecar read-back failed on ${terminal.deviceSN}: ${error.message}`);
    return 'error';
  }
};

/** Called after a TEMPLATE_WRITE was acknowledged with Return=0. */
const scheduleTemplateReadback = async (command) => {
  const terminal = await TerminalConfig.findOne({ deviceSN: command.terminalSN }).lean();
  if (!terminal) return 'no_terminal';
  if (canUseSidecar(terminal)) {
    setImmediate(() => sidecarReadback(terminal, command));
    return 'sidecar';
  }
  if (
    getSyncConfig().verification.pushReadback &&
    terminal.communicationProtocol !== 'zk_tcp_pull' &&
    isUsable(terminal, 'template_readback_push')
  ) {
    const { enqueueCommand } = require('./commandQueue');
    await enqueueCommand({
      terminal,
      type: 'TEMPLATE_QUERY',
      student: command.student,
      pin: command.pin,
      params: { pin: command.pin, fingerIndex: command.params?.fingerIndex },
      dedupeSuffix: `readback:${command.params?.fingerIndex}`,
    });
    return 'push_query';
  }
  return 'none';
};

/** Called after a USER_DELETE was acknowledged: confirm absence when a sidecar can read the device. */
const scheduleDeleteReadback = async (command) => {
  const terminal = await TerminalConfig.findOne({ deviceSN: command.terminalSN }).lean();
  if (!terminal || !canUseSidecar(terminal)) return 'none';
  setImmediate(async () => {
    try {
      const { users = [] } = (await getSidecar().getUsers(terminal.terminalIP)) || {};
      const present = users.some((u) => String(u.user_id) === String(command.pin));
      await TerminalUserState.updateOne(
        { terminalSN: terminal.deviceSN, pin: String(command.pin) },
        { $set: present ? { present: true, source: 'audit' } : { present: false, absenceVerifiedAt: new Date(), source: 'audit' } },
        { upsert: true }
      );
      if (present) await mismatchAlert(terminal.deviceSN, command.pin, '-');
      scheduleRecompute(command.student);
    } catch (error) {
      console.warn(`[verify] delete read-back failed on ${terminal.deviceSN}: ${error.message}`);
    }
  });
  return 'sidecar';
};

module.exports = { compareReadback, scheduleTemplateReadback, scheduleDeleteReadback, sidecarReadback };
