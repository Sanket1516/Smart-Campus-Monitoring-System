/** Shared helpers for ADMS command builders. */

const assertPin = (pin) => {
  const value = String(pin ?? '').trim();
  if (!/^\d{1,9}$/.test(value)) {
    throw new Error(`Invalid PIN "${value}" (digits only, max 9)`);
  }
  return value;
};

/** Field values may never contain TAB / CR / LF (they are command separators). */
const clean = (value, maxLength = 64) =>
  String(value ?? '')
    .replace(/[\t\r\n]/g, ' ')
    .trim()
    .slice(0, maxLength);

const assertFingerIndex = (fid) => {
  const value = Number(fid);
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new Error(`Invalid finger index "${fid}" (0-9)`);
  }
  return value;
};

const assertFlag = (flag) => {
  const value = Number(flag ?? 1);
  if (![0, 1, 3].includes(value)) {
    throw new Error(`Invalid template flag "${flag}" (0 invalid, 1 valid, 3 duress)`);
  }
  return value;
};

const assertTemplate = (tmp) => {
  const value = String(tmp ?? '').trim();
  if (!value || !/^[A-Za-z0-9+/=]+$/.test(value)) {
    throw new Error('Template must be a non-empty base64 string');
  }
  return value;
};

/**
 * Size= value. UNVERIFIED on X990 whether it counts decoded bytes or base64 characters,
 * so the mode is configurable (ADMS_TEMPLATE_SIZE_MODE).
 */
const computeTemplateSize = (tmp, mode = 'bytes') => {
  const value = assertTemplate(tmp);
  if (mode === 'base64') return value.length;
  return Buffer.from(value, 'base64').length;
};

/** Build "K=V\tK=V" from ordered pairs, dropping pairs whose value is undefined. */
const joinFields = (pairs) =>
  pairs
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join('\t');

/** In "omit" mode empty optional fields are left out (UNVERIFIED whether empty erases). */
const optionalField = (value, emptyFieldMode) => {
  const cleaned = clean(value);
  if (!cleaned && emptyFieldMode === 'omit') return undefined;
  return cleaned;
};

module.exports = {
  assertPin,
  assertFingerIndex,
  assertFlag,
  assertTemplate,
  clean,
  computeTemplateSize,
  joinFields,
  optionalField,
};
