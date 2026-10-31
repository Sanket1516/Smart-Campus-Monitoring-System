// Parsers for the text bodies terminals send to /iclock. Formats follow the open-source
// ADMS servers cited in the research report; anything else is marked UNVERIFIED.

const splitLines = (body) =>
  String(body || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim() !== '');

// "KEY=value\tKEY=value" -> { KEY: 'value' }. Keys are kept as sent and also lower-cased.
const parseKeyValues = (text) => {
  const result = {};

  String(text)
    .split('\t')
    .forEach((part) => {
      const index = part.indexOf('=');

      if (index <= 0) {
        return;
      }

      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      result[key] = value;
      result[key.toLowerCase()] = value;
    });

  return result;
};

// ATTLOG line: PIN \t Time \t Status \t Verify \t Workcode (trailing columns may be missing).
const parseAttlog = (body) =>
  splitLines(body)
    .map((line) => {
      const [pin = '', time = '', status = '', verify = '', workcode = ''] = line.split('\t').map((c) => c.trim());
      return { pin, time, status, verify, workcode };
    })
    .filter((entry) => entry.pin && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(entry.time));

// "2026-11-10 14:44:01" read in the given UTC offset ("+05:30").
const parseDeviceTime = (raw, utcOffset) => {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(String(raw || '').trim());

  if (!match || !/^[+-]\d{2}:\d{2}$/.test(utcOffset)) {
    return null;
  }

  const date = new Date(`${match[1]}T${match[2]}${utcOffset}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toUserRecord = (fields) => ({
  pin: fields.pin || '',
  name: fields.name || '',
  privilege: fields.pri ?? fields.privilege ?? '',
  card: fields.card ?? fields.cardno ?? '',
  group: fields.grp ?? fields.group ?? '',
});

const toFingerRecord = (fields) => ({
  pin: fields.pin || '',
  fingerIndex: Number(fields.fid ?? fields.no),
  sizeReported: fields.size !== undefined ? Number(fields.size) : null,
  flag: Number(fields.valid ?? 1),
  templateBase64: fields.tmp || '',
});

// OPERLOG (and USERINFO / FINGERTMP query results) may mix "USER ...", "FP ..." and
// "OPLOG ..." lines. Bare "PIN=..." lines are read by table name.
const parseRecordLines = (body, table = '') => {
  const users = [];
  const fingers = [];
  const biodata = [];
  let operations = 0;
  const upperTable = String(table).toUpperCase();

  splitLines(body).forEach((line) => {
    const space = line.indexOf(' ');
    const head = space > 0 ? line.slice(0, space).toUpperCase() : '';
    const rest = space > 0 ? line.slice(space + 1) : line;

    if (head === 'USER') {
      users.push(toUserRecord(parseKeyValues(rest)));
    } else if (head === 'FP') {
      fingers.push(toFingerRecord(parseKeyValues(rest)));
    } else if (head === 'BIODATA') {
      biodata.push(parseKeyValues(rest));
    } else if (head === 'OPLOG') {
      operations += 1;
    } else if (/^PIN=/i.test(line)) {
      const fields = parseKeyValues(line);

      if (upperTable === 'FINGERTMP') {
        fingers.push(toFingerRecord(fields));
      } else if (upperTable === 'BIODATA') {
        biodata.push(fields);
      } else {
        users.push(toUserRecord(fields));
      }
    }
  });

  // UNVERIFIED: v3 biodata rows; only Type=1 (fingerprint) is used.
  biodata
    .filter((fields) => String(fields.type) === '1')
    .forEach((fields) =>
      fingers.push({
        pin: fields.pin || '',
        fingerIndex: Number(fields.no),
        sizeReported: fields.size !== undefined ? Number(fields.size) : null,
        flag: fields.duress === '1' ? 3 : Number(fields.valid ?? 1),
        templateBase64: fields.tmp || '',
      })
    );

  return {
    users: users.filter((user) => user.pin),
    fingers: fingers.filter(
      (finger) => finger.pin && Number.isInteger(finger.fingerIndex) && finger.fingerIndex >= 0 && finger.fingerIndex <= 9
    ),
    operations,
  };
};

// devicecmd body: one "ID=..&Return=..&CMD=.." per line.
const parseDeviceCmdBody = (body) =>
  splitLines(body)
    .map((line) => {
      const params = new URLSearchParams(line.trim());
      return {
        cmdId: Number(params.get('ID')),
        returnCode: Number(params.get('Return')),
        cmd: params.get('CMD') || '',
      };
    })
    .filter((ack) => Number.isInteger(ack.cmdId) && ack.cmdId > 0 && Number.isFinite(ack.returnCode));

// UNVERIFIED: INFO= on getrequest is read as "firmware,users,fingers,attlogs,ip,fpAlgorithm,...".
// Only the firmware and fingerprint algorithm positions are used, and the raw string is kept.
const parseInfo = (raw) => {
  const parts = String(raw || '').split(',').map((part) => part.trim());

  return {
    raw: String(raw || '').trim(),
    firmware: parts[0] || '',
    fpAlgorithm: parts[5] || '',
  };
};

module.exports = {
  parseAttlog,
  parseDeviceCmdBody,
  parseDeviceTime,
  parseInfo,
  parseKeyValues,
  parseRecordLines,
  splitLines,
};
