/**
 * Pure helpers for the ADMS / iclock push protocol. No I/O here, so everything is unit-testable.
 */

const RETURN_CODES = {
  OK: 0,
  UNSUPPORTED: -1,
  FILE_ERROR: -2,
  BAD_SYNTAX: -1002,
  TABLE_UNSUPPORTED: -1004,
};

const describeReturnCode = (code) => {
  switch (Number(code)) {
    case 0:
      return 'ok';
    case -1:
      return 'unsupported';
    case -2:
      return 'file error';
    case -1002:
      return 'bad syntax';
    case -1004:
      return 'table unsupported';
    default:
      return `code ${code}`;
  }
};

const splitLines = (body) =>
  String(body || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim().length > 0);

/** "K=V\tK=V" -> {K: V}. Values may contain "=" (base64 padding), so split on the first. */
const parseKeyValues = (text, separator = '\t') => {
  const result = {};
  String(text || '')
    .split(separator)
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index <= 0) return;
      const key = part.slice(0, index).trim();
      result[key] = part.slice(index + 1);
    });
  return result;
};

/**
 * ATTLOG line: PIN\tTime\tStatus\tVerify\tWorkcode[\tReserved...]
 * Returns { records, errors }.
 */
const parseAttlog = (body) => {
  const records = [];
  const errors = [];
  splitLines(body).forEach((line, index) => {
    const parts = line.split('\t');
    const [pin, time, status = '', verify = '', workcode = '', ...extra] = parts.map((p) => p.trim());
    if (!pin || !/^\d+$/.test(pin) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time || '')) {
      errors.push({ line: index + 1, reason: 'malformed ATTLOG line' });
      return;
    }
    records.push({ pin, time, status, verify, workcode, extra });
  });
  return { records, errors };
};

/**
 * Interpret a device "YYYY-MM-DD HH:MM:SS" (no timezone) using a configured offset.
 * Returns a Date in UTC or null.
 */
const parseDeviceTime = (raw, utcOffsetMinutes = 0) => {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(raw || '').trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const utcMillis = Date.UTC(y, mo - 1, d, h, mi, s) - utcOffsetMinutes * 60 * 1000;
  const date = new Date(utcMillis);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * OPERLOG / USERINFO / FINGERTMP / BIODATA uploads.
 * Lines are prefixed ("USER ", "FP ", "OPLOG ", "BIODATA ") or, for some tables, bare K=V.
 */
const parseOperationLines = (body, table = '') => {
  const users = [];
  const templates = [];
  const operations = [];
  const unknown = [];
  const upperTable = String(table || '').toUpperCase();

  splitLines(body).forEach((line) => {
    const trimmed = line.trim();
    const spaceIndex = trimmed.indexOf(' ');
    const prefix = spaceIndex > 0 ? trimmed.slice(0, spaceIndex).toUpperCase() : '';
    const rest = spaceIndex > 0 ? trimmed.slice(spaceIndex + 1) : trimmed;

    if (prefix === 'USER') {
      const kv = parseKeyValues(rest);
      if (kv.PIN || kv.Pin) users.push(normalizeUser(kv));
      else unknown.push(trimmed.slice(0, 40));
    } else if (prefix === 'FP') {
      const tpl = normalizeClassicTemplate(parseKeyValues(rest));
      if (tpl) templates.push(tpl);
      else unknown.push('FP <unparseable>');
    } else if (prefix === 'BIODATA') {
      const tpl = normalizeV3Template(parseKeyValues(rest));
      if (tpl) templates.push(tpl);
      else unknown.push('BIODATA <unparseable>');
    } else if (prefix === 'OPLOG') {
      operations.push(rest.split('\t').map((p) => p.trim()));
    } else if (trimmed.includes('=')) {
      // Bare key/value line: decide by table name.
      const kv = parseKeyValues(trimmed);
      if (upperTable === 'FINGERTMP') {
        const tpl = normalizeClassicTemplate(kv);
        if (tpl) templates.push(tpl);
      } else if (upperTable === 'BIODATA') {
        const tpl = normalizeV3Template(kv);
        if (tpl) templates.push(tpl);
      } else if (upperTable === 'USERINFO' || upperTable === 'USER') {
        if (kv.PIN || kv.Pin) users.push(normalizeUser(kv));
      } else {
        unknown.push(trimmed.slice(0, 40));
      }
    } else {
      unknown.push(trimmed.slice(0, 40));
    }
  });

  return { users, templates, operations, unknown };
};

const normalizeUser = (kv) => ({
  pin: String(kv.PIN ?? kv.Pin).trim(),
  name: kv.Name || '',
  privilege: kv.Pri ?? kv.Privilege ?? '',
  hasPassword: Boolean(kv.Passwd || kv.Password),
  hasCard: Boolean(kv.Card || kv.CardNo),
});

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeClassicTemplate = (kv) => {
  const pin = kv.PIN ?? kv.Pin;
  const tmp = kv.TMP ?? kv.Tmp;
  const fid = toNumberOrNull(kv.FID ?? kv.FingerID);
  if (!pin || !tmp || fid === null) return null;
  return {
    dialect: 'classic',
    pin: String(pin).trim(),
    fingerIndex: fid,
    flag: toNumberOrNull(kv.Valid) ?? 1,
    sizeReported: toNumberOrNull(kv.Size),
    template: String(tmp).trim(),
  };
};

const normalizeV3Template = (kv) => {
  const pin = kv.Pin ?? kv.PIN;
  const tmp = kv.Tmp ?? kv.TMP;
  const fid = toNumberOrNull(kv.No ?? kv.FID);
  const type = toNumberOrNull(kv.Type);
  if (!pin || !tmp || fid === null) return null;
  if (type !== null && type !== 1) return null; // Type=1 is fingerprint; others ignored.
  const valid = toNumberOrNull(kv.Valid) ?? 1;
  const duress = toNumberOrNull(kv.Duress) === 1;
  return {
    dialect: 'v3',
    pin: String(pin).trim(),
    fingerIndex: fid,
    flag: valid === 0 ? 0 : duress ? 3 : 1,
    sizeReported: toNumberOrNull(kv.Size),
    majorVer: kv.MajorVer || '',
    minorVer: kv.MinorVer || '',
    template: String(tmp).trim(),
  };
};

/**
 * POST /iclock/devicecmd body: one or more lines "ID=..&Return=..&CMD=..".
 */
const parseDeviceCmdBody = (body) =>
  splitLines(body)
    .map((line) => {
      const kv = parseKeyValues(line, '&');
      const id = toNumberOrNull(kv.ID);
      const returnCode = toNumberOrNull(kv.Return);
      if (id === null || returnCode === null) return null;
      return { id, returnCode, cmd: (kv.CMD || '').trim() };
    })
    .filter(Boolean);

/** Format queued commands as "C:<id>:<command>" lines. */
const formatCommandLines = (commands) =>
  commands.map((command) => `C:${command.cmdId}:${command.text}`).join('\n');

/**
 * Handshake option block for GET /iclock/cdata?options=all.
 * Option names follow the open-source push references. UNVERIFIED on X990:
 * TransFlag values, TimeZone unit, ServerVer. All overridable (ADMS_OPTION_OVERRIDES).
 */
const buildHandshakeOptions = ({
  sn,
  attlogStamp = '',
  operlogStamp = '',
  timeZone = '5.5',
  serverVer = '2.4.1',
  overrides = {},
}) => {
  const options = {
    ATTLOGStamp: attlogStamp || '0',
    OPERLOGStamp: operlogStamp || '0',
    ATTPHOTOStamp: '0',
    ErrorDelay: '30',
    Delay: '5',
    TransTimes: '00:00;14:05',
    TransInterval: '1',
    TransFlag: 'TransData AttLog\tOpLog\tEnrollUser\tChgUser\tEnrollFP\tChgFP',
    TimeZone: String(timeZone),
    Realtime: '1',
    Encrypt: '0',
    ServerVer: serverVer,
    ...overrides,
  };
  const lines = [`GET OPTION FROM: ${sn}`];
  Object.entries(options).forEach(([key, value]) => {
    if (value !== null && value !== undefined) lines.push(`${key}=${value}`);
  });
  return lines.join('\n');
};

/**
 * INFO= query parameter on getrequest (comma separated). Field order UNVERIFIED on X990;
 * the common order is: firmware, users, fingerprints, punches, ip, fp algorithm, ...
 */
const parseDeviceInfo = (info) => {
  if (!info) return null;
  const parts = String(info).split(',').map((p) => p.trim());
  return {
    raw: String(info).slice(0, 300),
    firmware: parts[0] || '',
    userCount: toNumberOrNull(parts[1]),
    fingerprintCount: toNumberOrNull(parts[2]),
    punchCount: toNumberOrNull(parts[3]),
    ip: parts[4] || '',
    algorithmVersion: parts[5] || '',
  };
};

module.exports = {
  RETURN_CODES,
  describeReturnCode,
  splitLines,
  parseKeyValues,
  parseAttlog,
  parseDeviceTime,
  parseOperationLines,
  parseDeviceCmdBody,
  formatCommandLines,
  buildHandshakeOptions,
  parseDeviceInfo,
};
