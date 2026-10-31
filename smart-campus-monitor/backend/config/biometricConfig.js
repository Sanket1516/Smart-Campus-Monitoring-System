// Every value here that is marked UNVERIFIED is an open question for the hardware pilot.
// See HARDWARE_VERIFICATION.md. Values are read on each call so tests can change process.env.

const readString = (name, fallback, allowed) => {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : String(raw).trim();

  if (allowed && !allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')} (got "${value}")`);
  }

  return value;
};

const readInt = (name, fallback, { min = -Infinity, max = Infinity } = {}) => {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max} (got "${raw}")`);
  }

  return value;
};

const readBool = (name, fallback) => {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
};

const readIntList = (name, fallback) => {
  const raw = process.env[name];

  if (raw === undefined) {
    return fallback;
  }

  return String(raw)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number.parseInt(entry, 10))
    .filter(Number.isInteger);
};

const DIALECTS = ['classic', 'v3', 'unknown'];
const ENROLL_METHODS = ['menu', 'pyzk_remote', 'push_remote'];

const getBiometricConfig = () => ({
  adms: {
    // UNVERIFIED: whether one getrequest reply may carry several C: lines.
    maxCommandsPerPoll: readInt('ADMS_MAX_COMMANDS_PER_POLL', 1, { min: 1, max: 50 }),
    // Applied to every terminal when set. Use after the pilot settles the X990 dialect.
    dialectOverride: readString('ADMS_DIALECT_OVERRIDE', '', ['', 'classic', 'v3']),
    // What to do with non-probe commands while a terminal's dialect is still unknown.
    unknownDialectPolicy: readString('ADMS_UNKNOWN_DIALECT_POLICY', 'hold', ['hold', 'classic', 'v3']),
    // PIN used by dialect probe queries. Any PIN works; an absent PIN may return -1 (ambiguous).
    probePin: readString('ADMS_PROBE_PIN', '1'),
    // UNVERIFIED: whether FINGERTMP Size counts raw bytes or base64 characters.
    // as_uploaded = reuse the Size value the source terminal sent; fall back when there is none.
    fingertmpSizeMode: readString('ADMS_FINGERTMP_SIZE_MODE', 'as_uploaded', [
      'as_uploaded',
      'bytes',
      'base64_chars',
    ]),
    fingertmpSizeFallback: readString('ADMS_FINGERTMP_SIZE_FALLBACK', 'bytes', ['bytes', 'base64_chars']),
    // UNVERIFIED: whether an empty Passwd= / Card= erases the value on the terminal.
    // send_empty sends the full record (the server is the source of truth); omit leaves empty fields out.
    emptyFieldPolicy: readString('ADMS_EMPTY_FIELD_POLICY', 'send_empty', ['send_empty', 'omit']),
    // One project reports the clock cuts names at 24 characters.
    maxNameLength: readInt('ADMS_MAX_NAME_LENGTH', 24, { min: 1, max: 64 }),
    // UNVERIFIED: v3 field separator and biodata version fields.
    v3FieldSeparator: readString('ADMS_V3_FIELD_SEPARATOR', 'tab', ['tab', 'space']),
    v3BiodataMajorVer: readString('ADMS_V3_BIODATA_MAJORVER', '10'),
    v3BiodataMinorVer: readString('ADMS_V3_BIODATA_MINORVER', '0'),
    // UNVERIFIED: which Return codes a delete of a user who is already absent produces.
    deleteMissingOkCodes: readIntList('ADMS_DELETE_MISSING_OK_CODES', [-1]),
    // Return codes that mean "this command can never succeed here", so no retry.
    permanentFailureCodes: readIntList('ADMS_PERMANENT_FAILURE_CODES', [-1002, -1004]),
    // UNKNOWN on the X990. When false, keep /iclock on the terminal VLAN only.
    httpsEnabled: readBool('ADMS_HTTPS_ENABLED', false),
    // Reject plain-HTTP /iclock requests (only useful once a terminal is known to support TLS).
    requireTls: readBool('ADMS_REQUIRE_TLS', false),
    // Comma-separated IPv4 CIDRs allowed to reach /iclock, e.g. "10.20.0.0/16". Empty = loopback only.
    allowedCidrs: readString('ADMS_ALLOWED_CIDRS', '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    // Also require the request to come from the terminal's registered terminalIP.
    // Needs DHCP reservations; off by default.
    enforceTerminalIp: readBool('ADMS_ENFORCE_TERMINAL_IP', false),
    rateLimitPerMinute: readInt('ADMS_RATE_LIMIT_PER_MINUTE', 120, { min: 10 }),
    bodyLimit: readString('ADMS_BODY_LIMIT', '10mb'),
    // Push times carry no timezone. The terminal clock is read in this offset.
    deviceUtcOffset: readString('ADMS_DEVICE_UTC_OFFSET', '+05:30'),
    // Which time feeds the scan pipeline: the terminal's time or the server receive time.
    eventTimeSource: readString('ADMS_EVENT_TIME_SOURCE', 'device', ['device', 'server']),
    // Only the enrollment station may store templates; gate uploads only update presence.
    acceptTemplatesFrom: readString('ADMS_ACCEPT_TEMPLATES_FROM', 'enrollment', ['enrollment', 'any']),
    // UNVERIFIED: plain "OK" vs "OK: <count>" after a cdata upload. Sources differ.
    cdataReply: readString('ADMS_CDATA_REPLY', 'ok', ['ok', 'ok_count']),
    handshake: {
      // Option names follow shadow046/zkteco-adms. Values marked UNVERIFIED need a capture.
      initialStamp: readString('ADMS_INITIAL_STAMP', '0'),
      errorDelay: readInt('ADMS_ERROR_DELAY', 60, { min: 1 }),
      // UNVERIFIED: seconds between getrequest polls.
      delay: readInt('ADMS_POLL_DELAY_SECONDS', 10, { min: 1 }),
      transTimes: readString('ADMS_TRANS_TIMES', '00:00;23:59'),
      transInterval: readInt('ADMS_TRANS_INTERVAL', 1, { min: 0 }),
      // UNVERIFIED: which tables the terminal uploads. One project used 1101111000 on old firmware.
      transFlag: readString('ADMS_TRANS_FLAG', '1111000000'),
      // UNVERIFIED: "+05:30" form vs an hour count. Empty omits the line.
      timeZone: readString('ADMS_HANDSHAKE_TIMEZONE', '+05:30'),
      timeout: readInt('ADMS_HANDSHAKE_TIMEOUT', 60, { min: 1 }),
      syncTime: readInt('ADMS_SYNC_TIME', 3600, { min: 0 }),
      serverVer: readString('ADMS_SERVER_VER', '3.4.1 2010-06-07'),
    },
  },
  consent: {
    // Refuse to store templates (and start enrolment) without an active consent record.
    required: readBool('BIOMETRIC_REQUIRE_CONSENT', true),
  },
  queue: {
    ackTimeoutMs: readInt('COMMAND_ACK_TIMEOUT_MS', 10 * 60 * 1000, { min: 1000 }),
    maxAttempts: readInt('COMMAND_MAX_ATTEMPTS', 3, { min: 1, max: 20 }),
  },
  enrollment: {
    // UNVERIFIED: pyzk enroll_user fails on some ZK8 units; ENROLL_FP over push is unconfirmed.
    defaultMethod: readString('ENROLL_METHOD', 'menu', ENROLL_METHODS),
    // UNVERIFIED: whether the terminal uploads a template by itself after menu enrolment.
    expectAutoUpload: readBool('ENROLL_EXPECT_AUTO_UPLOAD', true),
  },
  sidecar: {
    // UNKNOWN: simultaneous TCP session limit on port 4370. Keep at 1 until the pilot says otherwise.
    maxSessionsPerTerminal: readInt('SIDECAR_MAX_SESSIONS_PER_TERMINAL', 1, { min: 1, max: 4 }),
    maxConcurrentTerminals: readInt('SIDECAR_MAX_CONCURRENT_TERMINALS', 4, { min: 1, max: 90 }),
  },
  // The legacy raw ZK TCP code in fingerprintService.js is untested on hardware.
  directZkTcpEnabled: readBool('DIRECT_ZK_TCP', false),
});

module.exports = {
  DIALECTS,
  ENROLL_METHODS,
  getBiometricConfig,
};
