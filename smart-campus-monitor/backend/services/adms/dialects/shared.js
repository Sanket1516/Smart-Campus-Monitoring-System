// Values go inside a TAB-separated line, so tabs and line breaks must never reach the terminal.
const clean = (value) =>
  String(value === undefined || value === null ? '' : value).replace(/[\t\r\n]+/g, ' ').trim();

const cleanName = (value, maxLength) => clean(value).slice(0, maxLength);

const cleanPin = (pin) => {
  const value = clean(pin);

  if (!/^[0-9A-Za-z]{1,24}$/.test(value)) {
    throw new Error(`Invalid PIN "${value}"`);
  }

  return value;
};

const cleanFingerIndex = (fingerIndex) => {
  const value = Number(fingerIndex);

  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new Error('Finger index must be 0 to 9');
  }

  return value;
};

const cleanBase64 = (value) => {
  const text = String(value || '');

  if (!text || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new Error('Template must be standard base64');
  }

  return text;
};

const joinFields = (pairs, separator) => pairs.map(([key, value]) => `${key}=${value}`).join(separator);

module.exports = {
  clean,
  cleanBase64,
  cleanFingerIndex,
  cleanName,
  cleanPin,
  joinFields,
};
