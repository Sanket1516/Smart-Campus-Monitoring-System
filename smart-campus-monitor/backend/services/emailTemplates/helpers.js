const NA = 'Not Available';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape every dynamic value before it is placed in HTML. */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

/** Strip control characters / header-injection characters and clamp length. */
const clean = (value, max = 120) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const orNA = (value, max) => clean(value, max) || NA;

const titleCase = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** Show only the last 4 digits of a SAP ID: 70552300067 -> *******0067. */
const maskSapId = (sapId) => {
  const id = clean(sapId, 20);
  if (!id) return NA;
  if (id.length <= 4) return id;
  return `${'•'.repeat(id.length - 4)}${id.slice(-4)}`;
};

const initialsOf = (name) => {
  const parts = clean(name, 80).split(' ').filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
};

const ordinalYear = (year) => {
  const n = Number(year);
  if (!Number.isInteger(n) || n < 1 || n > 6) return NA;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n] || 'th';
  return `${n}${suffix} Year`;
};

const formatTime = (date, timeZone) =>
  new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone })
    .format(date)
    .toUpperCase();

const formatDate = (date, timeZone) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(date);

/** Whole-minute duration -> "4h 25m" / "38m" / "Less than 1m". Non-finite/negative -> Not Available. */
const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return NA;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'Less than 1m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};

const isHttpsUrl = (value) => {
  try {
    return new URL(String(value)).protocol === 'https:';
  } catch (_e) {
    return false;
  }
};

const safeHttpUrl = (value) => {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch (_e) {
    return '';
  }
};

module.exports = {
  NA,
  esc,
  clean,
  orNA,
  titleCase,
  maskSapId,
  initialsOf,
  ordinalYear,
  formatTime,
  formatDate,
  formatDuration,
  isHttpsUrl,
  safeHttpUrl,
};
