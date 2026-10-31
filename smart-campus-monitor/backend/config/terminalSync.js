/**
 * Terminal-sync configuration.
 *
 * Every value that depends on unverified X990 behaviour is read here so it can be
 * changed after the hardware pilot without code changes. See HARDWARE_VERIFICATION.md.
 */

const parseIntEnv = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
};

const parseBoolEnv = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
};

const parseListEnv = (name, fallback = []) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return String(raw)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const parseJsonEnv = (name, fallback) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw new Error(`${name} must be valid JSON`);
  }
};

const oneOf = (name, allowed, fallback) => {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  if (!allowed.includes(raw)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')} (got "${raw}")`);
  }
  return raw;
};

const load = () => ({
  adms: {
    // Mount /iclock on its own listener (recommended: bind to the terminal VLAN interface only).
    port: parseIntEnv('ADMS_PORT', 0),
    host: process.env.ADMS_HOST || '0.0.0.0',
    // Optional HTTPS for push. UNVERIFIED whether the X990 supports it.
    tlsKeyPath: process.env.ADMS_TLS_KEY || '',
    tlsCertPath: process.env.ADMS_TLS_CERT || '',
    // Comma-separated CIDRs. Empty in production = refuse every terminal.
    allowedCidrs: parseListEnv('ADMS_ALLOWED_CIDRS', []),
    trustProxy: parseBoolEnv('ADMS_TRUST_PROXY', false),
    rateLimitPerMinute: parseIntEnv('ADMS_RATE_LIMIT_PER_MIN', 120),
    bodyLimit: process.env.ADMS_BODY_LIMIT || '5mb',
    // UNVERIFIED: whether one getrequest reply may carry several C: lines.
    maxCommandsPerPoll: Math.max(1, parseIntEnv('ADMS_MAX_COMMANDS_PER_POLL', 1)),
    // Wait for the previous command's ack before sending the next one.
    strictOrder: parseBoolEnv('ADMS_STRICT_ORDER', true),
    // UNVERIFIED: whether Size= counts raw template bytes or base64 characters.
    templateSizeMode: oneOf('ADMS_TEMPLATE_SIZE_MODE', ['bytes', 'base64'], 'bytes'),
    // UNVERIFIED: whether empty Passwd=/Card= erase existing values. "omit" leaves them out.
    emptyFieldMode: oneOf('ADMS_EMPTY_FIELD_MODE', ['omit', 'send'], 'omit'),
    // Force a dialect for every terminal instead of probing ("classic" | "v3").
    forceDialect: oneOf('ADMS_FORCE_DIALECT', ['', 'classic', 'v3'], ''),
    probeOnHandshake: parseBoolEnv('ADMS_PROBE_ON_HANDSHAKE', true),
    probePin: process.env.ADMS_PROBE_PIN || '999999999',
    // Return codes treated as "already deleted" for USER_DELETE (idempotency).
    deleteMissingCodes: parseListEnv('ADMS_DELETE_MISSING_CODES', ['-1']).map(Number),
    // Device timezone (push timestamps carry none). Minutes east of UTC.
    deviceUtcOffsetMinutes: parseIntEnv('ADMS_DEVICE_UTC_OFFSET_MIN', 330),
    // Value sent as TimeZone= in the handshake. UNVERIFIED units on X990.
    handshakeTimeZone: process.env.ADMS_HANDSHAKE_TIMEZONE || '5.5',
    // Punches older than this (device time vs server time) are stored but not run through
    // the live decision pipeline (prevents history uploads from triggering notifications).
    realtimeWindowSeconds: parseIntEnv('ADMS_REALTIME_WINDOW_SEC', 300),
    // Extra/override handshake options as JSON, e.g. {"TransFlag":"..."}.
    optionOverrides: parseJsonEnv('ADMS_OPTION_OVERRIDES', {}),
    // UNVERIFIED v3 command templates (see services/adms/dialects/v3.js).
    v3UserTable: process.env.ADMS_V3_USER_TABLE || 'user',
    v3BiodataTable: process.env.ADMS_V3_BIODATA_TABLE || 'biodata',
    v3MajorVer: process.env.ADMS_V3_MAJOR_VER || '',
    v3MinorVer: process.env.ADMS_V3_MINOR_VER || '',
  },
  queue: {
    ackTimeoutMinutes: parseIntEnv('SYNC_ACK_TIMEOUT_MIN', 10),
    maxAttempts: parseIntEnv('SYNC_MAX_ATTEMPTS', 3),
    sweepIntervalSeconds: parseIntEnv('SYNC_SWEEP_INTERVAL_SEC', 60),
    // "all" sends deletes to every enabled terminal (safe: delete-missing is a no-op);
    // "known" only to terminals we believe hold the student.
    deleteScope: oneOf('SYNC_DELETE_SCOPE', ['all', 'known'], 'all'),
  },
  groups: {
    defaultStudentGroups: parseListEnv('SYNC_DEFAULT_STUDENT_GROUPS', ['gate']),
    hostelGroupPrefix: 'hostel:',
  },
  enrollment: {
    defaultMethod: oneOf('ENROLL_METHOD', ['menu', 'pyzk_remote', 'push_remote'], 'menu'),
    // push_remote uses an ENROLL_FP command; UNVERIFIED, disabled unless explicitly enabled.
    pushRemoteEnabled: parseBoolEnv('ENROLL_PUSH_REMOTE_ENABLED', false),
    pyzkRemoteEnabled: parseBoolEnv('ENROLL_PYZK_REMOTE_ENABLED', false),
    requireConsent: parseBoolEnv('ENROLL_REQUIRE_CONSENT', true),
    defaultFingerIndex: parseIntEnv('ENROLL_DEFAULT_FINGER', 0),
  },
  sidecar: {
    url: (process.env.SIDECAR_URL || '').replace(/\/$/, ''),
    secret: process.env.SIDECAR_SECRET || '',
    timeoutMs: parseIntEnv('SIDECAR_TIMEOUT_MS', 60000),
    concurrency: Math.max(1, parseIntEnv('SIDECAR_CONCURRENCY', 2)),
    bulkThreshold: parseIntEnv('SYNC_BULK_THRESHOLD', 50),
    bulkDelayMs: parseIntEnv('SYNC_BULK_DELAY_MS', 250),
  },
  reconcile: {
    enabled: parseBoolEnv('RECONCILE_ENABLED', true),
    cron: process.env.RECONCILE_CRON || '20 2 * * *',
    timezone: process.env.RECONCILE_TZ || 'Asia/Kolkata',
    // sidecar = read users over ZK TCP; push = DATA QUERY USERINFO; state = DB only.
    source: oneOf('RECONCILE_SOURCE', ['sidecar', 'push', 'state'], 'state'),
    deleteUnknownPins: parseBoolEnv('RECONCILE_DELETE_UNKNOWN', false),
  },
});

let cached = null;

const getSyncConfig = () => {
  if (!cached) cached = load();
  return cached;
};

// For tests.
const resetSyncConfig = () => {
  cached = null;
};

module.exports = { getSyncConfig, resetSyncConfig };
