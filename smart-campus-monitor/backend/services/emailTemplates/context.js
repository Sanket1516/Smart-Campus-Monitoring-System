/**
 * Turns real backend data into the plain object the renderer consumes.
 * Nothing here invents values: anything the backend did not provide becomes "Not Available",
 * and optional contact details / URLs are simply omitted when not configured.
 */
const {
  NA,
  clean,
  orNA,
  titleCase,
  maskSapId,
  initialsOf,
  ordinalYear,
  formatTime,
  formatDate,
  isHttpsUrl,
  safeHttpUrl,
} = require('./helpers');
const { computeActivity } = require('./activity');
const { isHosteller } = require('../../utils/studentMeta');

// ZKTeco ATTLOG "Verify" codes. Only fingerprint (1) and face (15) are biometric.
const TERMINAL_VERIFY = {
  1: { label: 'Fingerprint (biometric)', icon: 'fingerprint', biometric: true },
  15: { label: 'Face recognition (biometric)', icon: 'fingerprint', biometric: true },
  0: { label: 'PIN / password at terminal', icon: 'idcard', biometric: false },
  2: { label: 'RFID card at terminal', icon: 'idcard', biometric: false },
};

/**
 * @param event { source: 'terminal'|'sap_scan', verifyMode?, terminal?, log? }
 */
const describeVerification = (event = {}) => {
  if (event.source === 'sap_scan') {
    return { label: 'SAP ID scan at gate (manual verification)', icon: 'idcard', biometric: false, verified: true };
  }
  if (event.source === 'terminal') {
    const known = TERMINAL_VERIFY[Number(event.verifyMode)];
    if (known && event.verifyMode !== '' && event.verifyMode != null) return { ...known, verified: true };
    return { label: 'Gate terminal scan (method not reported)', icon: 'terminal', biometric: false, verified: true };
  }
  return { label: NA, icon: 'idcard', biometric: false, verified: false };
};

const pickGate = (src = {}) => {
  const name = clean(src.gateName, 60);
  const number = src.gateNumber;
  if (name && number != null && number !== '') return `${name} (Gate ${number})`;
  if (name) return name;
  if (number != null && number !== '') return `Gate ${number}`;
  return NA;
};

const pickTerminal = (src = {}) => {
  const label = clean(src.terminalLabel, 60);
  const number = src.terminalNumber;
  if (label && number != null && number !== '') return `${label} (T${number})`;
  if (label) return label;
  if (number != null && number !== '') return `Terminal ${number}`;
  return NA;
};

const resolvePhoto = (student, env) => {
  if (String(env.EMAIL_INCLUDE_STUDENT_PHOTO).toLowerCase() !== 'true') return '';
  const raw = clean(student.photoUrl, 500);
  if (!raw) return '';
  if (isHttpsUrl(raw)) return raw;
  const base = clean(env.PUBLIC_BASE_URL, 200);
  if (raw.startsWith('/') && isHttpsUrl(base)) return `${base.replace(/\/$/, '')}${raw}`;
  return '';
};

/**
 * @param input {
 *   student, action: 'entry'|'exit', timestamp: Date, event, logs: EntryLog[],
 *   branding: { collegeName, collegeLogo, timezone, senderName }, env
 * }
 */
const buildContext = ({ student, action, timestamp, event = {}, logs = [], branding = {}, env = process.env }) => {
  const timeZone = branding.timezone || 'Asia/Kolkata';
  const at = new Date(timestamp);
  // Explicit picks: log/terminal may be Mongoose documents, so never spread them.
  const FIELDS = ['gateName', 'gateNumber', 'terminalNumber', 'terminalLabel', 'location'];
  const src = {};
  for (const key of FIELDS) {
    const value = event.terminal?.[key] ?? event.log?.[key];
    if (value !== undefined && value !== null && value !== '') src[key] = value;
  }
  const verification = describeVerification(event);
  const hostel = isHosteller(student.category) || student.studentType === 'hosteller';

  const portal = safeHttpUrl(env.PARENT_PORTAL_URL);
  const privacy = safeHttpUrl(env.PRIVACY_URL);
  const phone = clean(env.ADMIN_CONTACT_PHONE, 30);
  const supportEmail = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(clean(env.SUPPORT_EMAIL, 120)) ? clean(env.SUPPORT_EMAIL, 120) : '';

  const departmentRaw = clean(student.department, 80);
  const logo = isHttpsUrl(branding.collegeLogo) ? branding.collegeLogo : '';

  return {
    action,
    brand: {
      collegeName: clean(branding.collegeName, 120) || 'Smart Campus',
      systemName: 'Smart Campus Monitoring System',
      logoUrl: logo,
      tagline: 'Smarter Campus. Safer Students. Connected Families.',
    },
    student: {
      name: orNA(student.name, 80),
      initials: initialsOf(student.name),
      maskedSapId: maskSapId(student.sapId),
      department: departmentRaw ? titleCase(departmentRaw) : NA,
      year: ordinalYear(student.year),
      category: hostel ? 'Hosteller' : 'Day Scholar',
      photoUrl: resolvePhoto(student, env),
    },
    event: {
      time: formatTime(at, timeZone),
      date: formatDate(at, timeZone),
      gate: pickGate(src),
      terminal: pickTerminal(src),
      location: orNA(src.location, 100),
      verification: {
        method: verification.label,
        icon: verification.icon,
        biometric: verification.biometric,
        status: verification.verified ? 'Identity Verified' : NA,
        recorded: 'Event recorded successfully',
        // Terminal ID is the label/number the parent can recognise, never the raw device serial.
        terminalId: pickTerminal(src),
      },
    },
    activity: computeActivity(logs, { type: action, at }, timeZone),
    contact: { phone, email: supportEmail, portalUrl: portal, privacyUrl: privacy },
    subject:
      action === 'entry'
        ? `Campus Entry Confirmed | ${clean(student.name, 80) || 'Student'}`
        : `Campus Exit Recorded | ${clean(student.name, 80) || 'Student'}`,
  };
};

module.exports = { buildContext, describeVerification, pickGate, pickTerminal };
