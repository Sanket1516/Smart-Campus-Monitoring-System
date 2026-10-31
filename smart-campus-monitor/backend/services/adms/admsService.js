/**
 * ADMS / iclock push server logic (classic push). Terminals dial OUT to us.
 *
 *  GET  /iclock/cdata?SN=..&options=all   handshake (option block)
 *  POST /iclock/cdata?SN=..&table=..      ATTLOG / OPERLOG / USERINFO / FINGERTMP / BIODATA
 *  GET  /iclock/getrequest?SN=..          next queued command(s) as C:<id>:<cmd>, or OK
 *  POST /iclock/devicecmd?SN=..           acknowledgements ID=..&Return=..&CMD=..
 */
const TerminalConfig = require('../../models/TerminalConfig');
const Student = require('../../models/Student');
const AttendancePunch = require('../../models/AttendancePunch');
const AlertLog = require('../../models/AlertLog');
const { getSyncConfig } = require('../../config/terminalSync');
const protocol = require('./protocol');
const { enqueueCommand, takeNextCommands, applyAck, upsertUserState } = require('../sync/commandQueue');
const { storeTemplate } = require('../sync/templateStore');
const { hasActiveConsent } = require('../sync/consentService');
const { recordBiometricAudit } = require('../sync/biometricAudit');
const { getSystemConfiguration } = require('../configService');
const {
  emitTerminalOnline,
  emitUnknownTerminal,
  emitSyncAlert,
  emitSyncTerminal,
} = require('../socketService');

const SERVER_VER = '2.4.1';
const unknownSeen = new Map(); // SN -> last alert time (throttle alerts)

const log = (...args) => {
  if (process.env.NODE_ENV !== 'test') console.log('[adms]', ...args);
};

/** Registered + enabled terminal lookup. Unknown serials are logged and alerted (throttled). */
const findRegisteredTerminal = async (sn, ip) => {
  const serial = String(sn || '').trim();
  if (!serial) return { error: 'missing SN' };
  const terminal = await TerminalConfig.findOne({ deviceSN: serial });
  if (!terminal) {
    const last = unknownSeen.get(serial) || 0;
    if (Date.now() - last > 10 * 60 * 1000) {
      unknownSeen.set(serial, Date.now());
      const payload = { deviceSN: serial, ip, time: new Date().toISOString(), channel: 'adms' };
      log(`refused unknown terminal SN=${serial} ip=${ip}`);
      try {
        await AlertLog.create({ type: 'unknown_terminal', message: `Unregistered terminal ${serial} contacted /iclock from ${ip}`, metadata: payload });
      } catch (_error) {
        /* ignore */
      }
      emitUnknownTerminal(payload);
    }
    return { error: 'unknown terminal' };
  }
  if (terminal.enabled === false) return { error: 'terminal disabled' };
  return { terminal };
};

const markSeen = async (terminal, ip, extra = {}) => {
  const now = new Date();
  const wasOffline = !terminal.isOnline;
  await TerminalConfig.updateOne(
    { _id: terminal._id },
    { $set: { isOnline: true, lastSeen: now, status: 'online', lastSeenIp: ip || '', ...extra } }
  );
  Object.assign(terminal, { isOnline: true, lastSeen: now, status: 'online', ...extra });
  if (wasOffline) {
    emitTerminalOnline({
      deviceSN: terminal.deviceSN,
      machineNumber: terminal.machineNumber,
      gateName: terminal.gateName,
      terminalLabel: terminal.terminalLabel,
    });
  }
};

/** Queue a dialect probe if the dialect is unknown. */
const ensureDialectProbe = async (terminal, dialectToTry = 'classic') => {
  const { adms } = getSyncConfig();
  if (adms.forceDialect) {
    if (terminal.dialect !== adms.forceDialect) {
      await TerminalConfig.updateOne({ _id: terminal._id }, { $set: { dialect: adms.forceDialect, dialectSource: 'config' } });
      terminal.dialect = adms.forceDialect;
    }
    return null;
  }
  if (terminal.dialect !== 'unknown' || !adms.probeOnHandshake) return null;
  const { command } = await enqueueCommand({
    terminal,
    type: 'PROBE',
    params: { pin: adms.probePin },
    dedupeSuffix: dialectToTry,
    dialectName: dialectToTry,
  });
  return command;
};

const handleHandshake = async (terminal, query, ip) => {
  const extra = {};
  if (query.pushver) extra.pushVersion = String(query.pushver).slice(0, 32);
  await markSeen(terminal, ip, extra);
  log(`handshake SN=${terminal.deviceSN} ip=${ip} pushver=${query.pushver || '-'} dialect=${terminal.dialect} query=${JSON.stringify(query).slice(0, 300)}`);
  await ensureDialectProbe(terminal);
  const { adms } = getSyncConfig();
  return protocol.buildHandshakeOptions({
    sn: terminal.deviceSN,
    attlogStamp: terminal.attlogStamp,
    operlogStamp: terminal.operlogStamp,
    timeZone: adms.handshakeTimeZone,
    serverVer: SERVER_VER,
    overrides: adms.optionOverrides,
  });
};

/** Resolve a student from a PIN (global PIN first, legacy allocation via the scan pipeline). */
const findStudentByPin = (pin) =>
  Student.findOne({ zktUserID: Number(pin) }).select('_id name zktUserID accessStatus isActive consentRef fingerprintStatus');

const handleAttlog = async (terminal, body) => {
  const { adms } = getSyncConfig();
  const { records, errors } = protocol.parseAttlog(body);
  const serverReceivedAt = new Date();
  const results = { received: records.length, inserted: 0, duplicates: 0, decided: 0, recordedOnly: 0, malformed: errors.length };
  const { processTerminalScanEvent } = require('../../controllers/fingerprintController');

  let maintenance = false;
  try {
    maintenance = Boolean((await getSystemConfiguration()).maintenanceMode);
  } catch (_error) {
    maintenance = false;
  }

  for (const record of records) {
    const deviceTime = protocol.parseDeviceTime(record.time, adms.deviceUtcOffsetMinutes);
    let punch;
    try {
      punch = await AttendancePunch.create({
        terminalSN: terminal.deviceSN,
        pin: record.pin,
        deviceTimeRaw: record.time,
        deviceTime,
        serverReceivedAt,
        status: record.status,
        verify: record.verify,
        workcode: record.workcode,
        extra: record.extra,
      });
      results.inserted += 1;
    } catch (error) {
      if (Number(error?.code) === 11000) {
        results.duplicates += 1;
        continue;
      }
      throw error;
    }

    const skewSeconds = deviceTime ? Math.abs(serverReceivedAt - deviceTime) / 1000 : Infinity;
    if (maintenance || skewSeconds > adms.realtimeWindowSeconds) {
      results.recordedOnly += 1;
      await AttendancePunch.updateOne(
        { _id: punch._id },
        { $set: { processed: 'recorded_only', decision: { reason: maintenance ? 'maintenance' : 'outside_realtime_window', skewSeconds: Number.isFinite(skewSeconds) ? Math.round(skewSeconds) : null } } }
      );
      continue;
    }

    try {
      // Server receive time is authoritative for the decision (device clock may drift).
      const decision = await processTerminalScanEvent({
        terminal,
        userId: record.pin,
        now: serverReceivedAt,
        verifyMode: record.verify,
      });
      results.decided += 1;
      await AttendancePunch.updateOne(
        { _id: punch._id },
        {
          $set: {
            processed: 'decision',
            student: decision.student?._id || null,
            decision: { allow: Boolean(decision.allow), reason: decision.reason, action: decision.action || null },
          },
        }
      );
      if (decision.reason === 'blocked' && decision.student) {
        await handleBlockedOnTerminal(terminal, decision.student, record.pin);
      }
    } catch (error) {
      await AttendancePunch.updateOne({ _id: punch._id }, { $set: { processed: 'error', decision: { error: error.message } } });
    }
  }
  return results;
};

/** A blocked student is still on a terminal: delete there now and raise a security alert. */
const handleBlockedOnTerminal = async (terminal, student, pin) => {
  const { enqueueDelete } = require('../sync/terminalSyncService');
  await enqueueDelete(student, { actor: `terminal:${terminal.deviceSN}`, reason: 'blocked_user_on_terminal' });
  const message = `SECURITY: blocked student PIN ${pin} still present on ${terminal.terminalLabel || terminal.deviceSN}; deletion queued`;
  try {
    await AlertLog.create({
      type: 'security_blocked_on_terminal',
      message,
      metadata: { terminalSN: terminal.deviceSN, pin, student: student._id },
    });
  } catch (_error) {
    /* ignore */
  }
  emitSyncAlert({ message, terminalSN: terminal.deviceSN, pin, severity: 'security' });
};

const handleOperations = async (terminal, table, body) => {
  const parsed = protocol.parseOperationLines(body, table);
  const results = { users: parsed.users.length, templates: parsed.templates.length, stored: 0, ignored: 0, operations: parsed.operations.length };
  const acceptFrom = process.env.ACCEPT_TEMPLATES_FROM === 'any' ? 'any' : 'enrollment';
  const isEnrollment = terminal.isEnrollmentStation || terminal.role === 'enrollment';
  const { enrollment } = getSyncConfig();

  for (const user of parsed.users) {
    const student = await findStudentByPin(user.pin);
    await upsertUserState({ terminalSN: terminal.deviceSN, pin: user.pin, student: student?._id || null, present: true, source: 'audit' });
    if (student && student.accessStatus === 'blocked') {
      await handleBlockedOnTerminal(terminal, student, user.pin);
    }
  }

  for (const tpl of parsed.templates) {
    const student = await findStudentByPin(tpl.pin);
    if (!student || !student.isActive) {
      results.ignored += 1;
      log(`ignored template for unknown/inactive PIN ${tpl.pin} from ${terminal.deviceSN}`);
      continue;
    }
    await upsertUserState({
      terminalSN: terminal.deviceSN,
      pin: tpl.pin,
      student: student._id,
      present: true,
      fingerIndex: tpl.fingerIndex,
      source: 'audit',
    });
    if (acceptFrom === 'enrollment' && !isEnrollment) {
      results.ignored += 1;
      continue;
    }
    if (enrollment.requireConsent && !(await hasActiveConsent(student))) {
      results.ignored += 1;
      await recordBiometricAudit({
        actor: `terminal:${terminal.deviceSN}`,
        action: 'template_store',
        student,
        terminal: terminal.deviceSN,
        result: 'rejected_no_consent',
        details: { fingerIndex: tpl.fingerIndex },
      });
      continue;
    }
    try {
      const stored = await storeTemplate({
        student,
        pin: tpl.pin,
        fingerIndex: tpl.fingerIndex,
        flag: tpl.flag,
        sizeReported: tpl.sizeReported,
        template: tpl.template,
        sourceTerminal: terminal.deviceSN,
        channel: 'push',
        dialect: tpl.dialect,
        algorithmVersion: terminal.algorithmVersion || '',
        actor: `terminal:${terminal.deviceSN}`,
      });
      if (stored.changed) {
        results.stored += 1;
        const { onTemplateStored } = require('../sync/terminalSyncService');
        await onTemplateStored(student, { sourceTerminal: terminal.deviceSN, actor: `terminal:${terminal.deviceSN}` });
      }
    } catch (error) {
      results.ignored += 1;
      log(`template store failed for PIN ${tpl.pin}: ${error.message}`);
    }
  }
  if (parsed.unknown.length) log(`unparsed ${table} lines from ${terminal.deviceSN}: ${parsed.unknown.length}`);
  return results;
};

const handleCdataPost = async (terminal, query, body, ip) => {
  await markSeen(terminal, ip);
  const table = String(query.table || '').toUpperCase();
  const stamp = query.Stamp || query.stamp;
  let result;
  if (table === 'ATTLOG') {
    result = await handleAttlog(terminal, body);
    if (stamp) await TerminalConfig.updateOne({ _id: terminal._id }, { $set: { attlogStamp: String(stamp).slice(0, 32) } });
  } else if (['OPERLOG', 'USERINFO', 'FINGERTMP', 'BIODATA', 'USER'].includes(table)) {
    result = await handleOperations(terminal, table, body);
    if (stamp && table === 'OPERLOG') {
      await TerminalConfig.updateOne({ _id: terminal._id }, { $set: { operlogStamp: String(stamp).slice(0, 32) } });
    }
  } else {
    log(`unhandled table "${table}" from ${terminal.deviceSN} (${String(body || '').length} bytes)`);
    result = { unhandled: table };
  }
  log(`cdata SN=${terminal.deviceSN} table=${table} ${JSON.stringify(result)}`);
  return result;
};

const handleGetRequest = async (terminal, query, ip) => {
  const extra = {};
  const info = protocol.parseDeviceInfo(query.INFO);
  if (info) {
    extra.deviceInfoRaw = info.raw;
    if (info.firmware) extra.firmware = info.firmware.slice(0, 64);
    if (info.algorithmVersion) extra.algorithmVersion = info.algorithmVersion.slice(0, 32);
  }
  await markSeen(terminal, ip, extra);
  const commands = await takeNextCommands(terminal.deviceSN);
  if (!commands.length) return 'OK';
  log(`getrequest SN=${terminal.deviceSN} sending ${commands.map((c) => `${c.cmdId}:${c.type}`).join(',')}`);
  return protocol.formatCommandLines(commands);
};

/** Dialect detection from a PROBE ack. */
const handleProbeResult = async (terminal, command, returnCode) => {
  const tried = command.dialect;
  if (returnCode === 0) {
    await TerminalConfig.updateOne({ _id: terminal._id }, { $set: { dialect: tried, dialectSource: 'probe' } });
    log(`dialect detected SN=${terminal.deviceSN} dialect=${tried} pushver=${terminal.pushVersion || '-'}`);
    emitSyncTerminal({ terminalSN: terminal.deviceSN, event: 'dialect_detected', dialect: tried });
    return tried;
  }
  if (returnCode === -1 || returnCode === -1004) {
    if (tried === 'classic') {
      await ensureDialectProbe({ ...terminal.toObject?.() ?? terminal, dialect: 'unknown' }, 'v3');
      return 'probing_v3';
    }
    const message = `Dialect probe failed on ${terminal.deviceSN}: classic and v3 both rejected; set dialect manually`;
    log(message);
    emitSyncAlert({ message, terminalSN: terminal.deviceSN });
    return 'undetermined';
  }
  log(`ambiguous probe result ${returnCode} on ${terminal.deviceSN} (${tried}); dialect left unknown`);
  return 'ambiguous';
};

const handleDeviceCmd = async (terminal, body, ip) => {
  await markSeen(terminal, ip);
  const acks = protocol.parseDeviceCmdBody(body);
  const out = [];
  for (const ack of acks) {
    const result = await applyAck({ terminalSN: terminal.deviceSN, id: ack.id, returnCode: ack.returnCode });
    if (result.unknown) {
      log(`ack for unknown command ${ack.id} from ${terminal.deviceSN}`);
      out.push({ id: ack.id, unknown: true });
      continue;
    }
    if (result.command?.type === 'PROBE' && !result.duplicate) {
      out.push({ id: ack.id, probe: await handleProbeResult(terminal, result.command, ack.returnCode) });
      continue;
    }
    out.push({ id: ack.id, success: result.success });
  }
  log(`devicecmd SN=${terminal.deviceSN} ${JSON.stringify(out)}`);
  return out;
};

module.exports = {
  findRegisteredTerminal,
  handleHandshake,
  handleCdataPost,
  handleGetRequest,
  handleDeviceCmd,
  handleAttlog,
  handleOperations,
  handleProbeResult,
  ensureDialectProbe,
  handleBlockedOnTerminal,
};
