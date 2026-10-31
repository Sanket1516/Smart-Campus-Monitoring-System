// ADMS / iClock push endpoints. Terminals dial out to these; nothing here connects to a terminal.
// Bodies are plain text. Template data is never logged or echoed.
const Student = require('../models/Student');
const DeviceAllocation = require('../models/DeviceAllocation');
const TerminalUserState = require('../models/TerminalUserState');
const BiometricTemplate = require('../models/BiometricTemplate');
const BiometricAuditLog = require('../models/BiometricAuditLog');
const PushAttendanceEvent = require('../models/PushAttendanceEvent');
const AlertLog = require('../models/AlertLog');
const { getBiometricConfig } = require('../config/biometricConfig');
const {
  parseAttlog,
  parseDeviceCmdBody,
  parseDeviceTime,
  parseInfo,
  parseRecordLines,
} = require('../services/adms/parsers');
const {
  claimNextCommands,
  enqueueCommand,
  enqueueDialectProbes,
  formatPollResponse,
  recordAck,
  templateAad,
} = require('../services/commandQueueService');
const { evaluateScan, markTerminalSeen } = require('../services/scanDecisionService');
const { encryptTemplate, sha256Hex } = require('../services/templateCrypto');
const { hasActiveConsent } = require('../services/consentService');
const syncEvents = require('../services/syncEvents');

const REPROBE_INTERVAL_MS = 60 * 60 * 1000;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

const sendText = (res, text) => res.status(200).type('text/plain').send(text);

const isDuplicateKeyError = (error) => Number(error?.code) === 11000;

const touchTerminal = async (terminal, now) => {
  terminal.lastPushAt = now;
  await markTerminalSeen(terminal, now);
};

// PIN -> student. A per-terminal allocation wins; otherwise the global zktUserID.
const resolveStudentByPin = async (terminal, pin) => {
  const numericPin = Number(pin);

  if (!Number.isInteger(numericPin)) {
    return null;
  }

  const allocation = await DeviceAllocation.findOne({ deviceId: terminal._id, localUserId: numericPin })
    .select('studentId')
    .lean();

  return Student.findOne(allocation?.studentId ? { _id: allocation.studentId } : { zktUserID: numericPin });
};

const maybeProbeDialect = async (terminal, config) => {
  if (config.adms.dialectOverride || terminal.dialect !== 'unknown') {
    return;
  }

  const probedAt = terminal.dialectProbe?.probedAt;

  if (!probedAt || Date.now() - probedAt.getTime() > REPROBE_INTERVAL_MS) {
    await enqueueDialectProbes(terminal, config);
  }
};

const buildOptionsResponse = (terminal, config) => {
  const options = config.adms.handshake;
  const stamps = terminal.admsStamps || {};
  const lines = [
    `GET OPTION FROM: ${terminal.deviceSN}`,
    `ATTLOGStamp=${stamps.attlog || options.initialStamp}`,
    `OPERLOGStamp=${stamps.operlog || options.initialStamp}`,
    `ATTPHOTOStamp=${stamps.attphoto || options.initialStamp}`,
    `ErrorDelay=${options.errorDelay}`,
    `Delay=${options.delay}`,
    `TransTimes=${options.transTimes}`,
    `TransInterval=${options.transInterval}`,
    `TransFlag=${options.transFlag}`,
  ];

  if (options.timeZone) {
    lines.push(`TimeZone=${options.timeZone}`);
  }

  lines.push(
    `Timeout=${options.timeout}`,
    `SyncTime=${options.syncTime}`,
    'Realtime=1',
    'Encrypt=0',
    `ServerVer=${options.serverVer}`
  );

  return `${lines.join('\n')}\n`;
};

// GET /iclock/cdata?SN=..&options=all&pushver=..
exports.handshake = async (req, res) => {
  try {
    const config = getBiometricConfig();
    const { terminal } = req;
    const now = new Date();
    const pushVersion = String(req.query.pushver || '').trim();

    if (pushVersion && pushVersion !== terminal.pushVersion) {
      terminal.pushVersion = pushVersion;
    }

    terminal.tlsSupported = req.secure ? true : terminal.tlsSupported;
    await touchTerminal(terminal, now);
    console.info(
      `[iclock] handshake ${terminal.deviceSN} pushver=${terminal.pushVersion || '?'} dialect=${terminal.dialect} ip=${req.terminalIp}`
    );

    if (!req.query.options) {
      return sendText(res, 'OK');
    }

    await maybeProbeDialect(terminal, config);
    return sendText(res, buildOptionsResponse(terminal, config));
  } catch (error) {
    console.error('iclock handshake failed:', error.message);
    return sendText(res, 'OK');
  }
};

const recordStamp = (terminal, table, stamp) => {
  const field = { ATTLOG: 'attlog', OPERLOG: 'operlog', ATTPHOTO: 'attphoto' }[table];

  if (field && stamp) {
    terminal.set(`admsStamps.${field}`, String(stamp).slice(0, 64));
  }
};

const handleBlockedOnTerminal = async (terminal, student, pin, now) => {
  const { created } = await enqueueCommand({
    terminalSN: terminal.deviceSN,
    type: 'deleteUser',
    student,
    params: { pin: String(pin) },
    jobId: `blocked-scan:${student._id}`,
  });

  if (created) {
    await AlertLog.create({
      type: 'security',
      message: `${student.name} (${student.sapId}) is blocked but is still enrolled on ${terminal.terminalLabel}; delete re-queued`,
      metadata: { deviceSN: terminal.deviceSN, studentId: student._id, pin: String(pin), time: now.toISOString() },
    });
    await BiometricAuditLog.create({
      actorType: 'system',
      action: 'user_delete',
      student: student._id,
      terminal: terminal.deviceSN,
      result: 'queued',
      detail: { reason: 'blocked student scanned on terminal' },
      timestamp: now,
    });
  }
};

const processAttlog = async (terminal, body, config) => {
  const entries = parseAttlog(body);
  let stored = 0;

  for (const entry of entries) {
    const serverReceivedAt = new Date();
    const deviceTime = parseDeviceTime(entry.time, config.adms.deviceUtcOffset);
    let event;

    try {
      event = await PushAttendanceEvent.create({
        terminalSN: terminal.deviceSN,
        pin: entry.pin,
        deviceTimeRaw: entry.time,
        deviceTime,
        serverReceivedAt,
        status: entry.status,
        verify: entry.verify,
        workcode: entry.workcode,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        continue;
      }

      throw error;
    }

    stored += 1;

    try {
      const now = config.adms.eventTimeSource === 'device' && deviceTime ? deviceTime : serverReceivedAt;
      const decision = await evaluateScan({
        terminal,
        deviceSN: terminal.deviceSN,
        machineNumber: terminal.machineNumber,
        userId: entry.pin,
        now,
        verifyMode: entry.verify,
      });

      event.result = { allow: decision.response.allow, reason: decision.reason };
      event.student = decision.student?._id || null;
      await event.save();

      // The terminal has already decided at the door; software deny records it and
      // makes sure the delete reaches this terminal.
      if (decision.reason === 'blocked') {
        await handleBlockedOnTerminal(terminal, decision.student, entry.pin, serverReceivedAt);
      }
    } catch (error) {
      console.error(`ATTLOG processing failed for ${terminal.deviceSN}:`, error.message);
      event.result = { allow: false, reason: 'error' };
      await event.save().catch(() => {});
    }
  }

  return stored;
};

const markPresent = (student, terminal, now, fingerIndex) =>
  TerminalUserState.updateOne(
    { student: student._id, terminalSN: terminal.deviceSN },
    {
      $set: { present: true, lastConfirmedAt: now, source: 'audit' },
      ...(Number.isInteger(fingerIndex) ? { $addToSet: { fingerIndexes: fingerIndex } } : {}),
    },
    { upsert: true }
  );

const canStoreTemplatesFrom = (terminal, config) =>
  config.adms.acceptTemplatesFrom === 'any' || terminal.isEnrollmentStation;

const storeUploadedTemplate = async (student, terminal, finger, now) => {
  if (!(await hasActiveConsent(student))) {
    await AlertLog.create({
      type: 'security',
      message: `Template for ${student.name} (${student.sapId}) uploaded by ${terminal.terminalLabel} was refused: no consent recorded`,
      metadata: { deviceSN: terminal.deviceSN, studentId: student._id, fingerIndex: finger.fingerIndex },
    });
    await BiometricAuditLog.create({
      actorType: 'terminal',
      action: 'template_store',
      student: student._id,
      terminal: terminal.deviceSN,
      result: 'failure',
      detail: { reason: 'no active consent', fingerIndex: finger.fingerIndex },
      timestamp: now,
    });
    return false;
  }

  if (!BASE64_PATTERN.test(finger.templateBase64)) {
    return false;
  }

  const bytes = Buffer.from(finger.templateBase64, 'base64');
  const sha256 = sha256Hex(bytes);
  const existing = await BiometricTemplate.findOne({ student: student._id, fingerIndex: finger.fingerIndex })
    .select('sha256')
    .lean();

  if (existing?.sha256 === sha256) {
    return false;
  }

  await BiometricTemplate.findOneAndUpdate(
    { student: student._id, fingerIndex: finger.fingerIndex },
    {
      $set: {
        flag: [0, 1, 3].includes(finger.flag) ? finger.flag : 1,
        sizeReported: Number.isFinite(finger.sizeReported) ? finger.sizeReported : null,
        byteLength: bytes.length,
        sha256,
        dataEncrypted: encryptTemplate(bytes, templateAad(student._id, finger.fingerIndex)),
        sourceFormat: 'adms_base64',
        sourceTerminal: terminal.deviceSN,
        algorithmVersion: terminal.algorithmVersion || '',
      },
    },
    { upsert: true, runValidators: true }
  );

  student.fingerprintStatus = 'enrolled';
  student.fingerprintEnrolled = true;
  student.fingerprintEnrolledAt = student.fingerprintEnrolledAt || now;
  await student.save();

  await BiometricAuditLog.create({
    actorType: 'terminal',
    action: 'template_store',
    student: student._id,
    terminal: terminal.deviceSN,
    result: 'success',
    detail: { fingerIndex: finger.fingerIndex, sha256, byteLength: bytes.length, sizeReported: finger.sizeReported },
    timestamp: now,
  });

  syncEvents.emit('templateStored', {
    studentId: String(student._id),
    terminalSN: terminal.deviceSN,
    fingerIndex: finger.fingerIndex,
  });

  return true;
};

const processRecords = async (terminal, body, table, config) => {
  const { users, fingers, operations } = parseRecordLines(body, table);
  const now = new Date();

  for (const user of users) {
    const student = await resolveStudentByPin(terminal, user.pin);

    if (student) {
      await markPresent(student, terminal, now);
    }
  }

  for (const finger of fingers) {
    const student = await resolveStudentByPin(terminal, finger.pin);

    if (!student) {
      console.warn(`[iclock] ${terminal.deviceSN} uploaded a template for unknown PIN ${finger.pin}`);
      continue;
    }

    await markPresent(student, terminal, now, finger.fingerIndex);

    if (canStoreTemplatesFrom(terminal, config) && finger.templateBase64) {
      await storeUploadedTemplate(student, terminal, finger, now);
    }
  }

  return users.length + fingers.length + operations;
};

// POST /iclock/cdata?SN=..&table=..&Stamp=..
exports.upload = async (req, res) => {
  const config = getBiometricConfig();
  const { terminal } = req;
  const table = String(req.query.table || '').toUpperCase();
  const body = typeof req.body === 'string' ? req.body : '';

  try {
    recordStamp(terminal, table, req.query.Stamp);
    await touchTerminal(terminal, new Date());

    let count = 0;

    if (table === 'ATTLOG') {
      count = await processAttlog(terminal, body, config);
    } else if (['OPERLOG', 'USERINFO', 'FINGERTMP', 'BIODATA'].includes(table)) {
      count = await processRecords(terminal, body, table, config);
    }

    return sendText(res, config.adms.cdataReply === 'ok_count' ? `OK: ${count}` : 'OK');
  } catch (error) {
    // A non-OK reply makes the terminal resend; de-duplication makes that safe.
    console.error(`iclock upload (${table}) failed for ${terminal.deviceSN}:`, error.message);
    return res.status(500).type('text/plain').send('ERROR');
  }
};

// GET /iclock/getrequest?SN=..&INFO=..
exports.poll = async (req, res) => {
  try {
    const config = getBiometricConfig();
    const { terminal } = req;

    if (req.query.INFO) {
      const info = parseInfo(req.query.INFO);
      terminal.pushInfoRaw = info.raw.slice(0, 500);
      terminal.firmware = info.firmware || terminal.firmware;
      terminal.algorithmVersion = info.fpAlgorithm || terminal.algorithmVersion;
    }

    await touchTerminal(terminal, new Date());
    await maybeProbeDialect(terminal, config);

    const claimed = await claimNextCommands(terminal);
    return sendText(res, formatPollResponse(claimed));
  } catch (error) {
    console.error('iclock poll failed:', error.message);
    return sendText(res, 'OK');
  }
};

// POST /iclock/devicecmd?SN=..
exports.commandResult = async (req, res) => {
  try {
    const { terminal } = req;
    const acks = parseDeviceCmdBody(typeof req.body === 'string' ? req.body : '');

    for (const ack of acks) {
      const result = await recordAck({ terminalSN: terminal.deviceSN, cmdId: ack.cmdId, returnCode: ack.returnCode });

      if (!result.matched) {
        console.warn(`[iclock] ${terminal.deviceSN} acked unknown command ${ack.cmdId} (Return=${ack.returnCode})`);
      }
    }

    await touchTerminal(terminal, new Date());
    return sendText(res, 'OK');
  } catch (error) {
    console.error('iclock devicecmd failed:', error.message);
    return res.status(500).type('text/plain').send('ERROR');
  }
};

// GET /iclock/ping
exports.ping = async (req, res) => {
  await touchTerminal(req.terminal, new Date()).catch(() => {});
  return sendText(res, 'OK');
};

exports.buildOptionsResponse = buildOptionsResponse;
