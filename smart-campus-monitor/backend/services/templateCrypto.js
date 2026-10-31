const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// BIOMETRIC_KEY: 32 random bytes as 64 hex characters or as base64.
// Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const parseKey = (raw) => {
  const value = String(raw || '').trim();

  if (!value) {
    return null;
  }

  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  return key.length === 32 ? key : null;
};

const getKey = () => {
  const key = parseKey(process.env.BIOMETRIC_KEY);

  if (!key) {
    throw new Error('BIOMETRIC_KEY is missing or is not 32 bytes (64 hex characters or base64)');
  }

  return key;
};

// Called at startup so the server refuses to run without a template key.
const assertBiometricKey = () => {
  getKey();
  return true;
};

const sha256Hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

// aad binds the ciphertext to its record (student + finger), so a ciphertext copied
// onto another record fails to decrypt.
const encryptTemplate = (templateBuffer, aad = '') => {
  if (!Buffer.isBuffer(templateBuffer) || !templateBuffer.length) {
    throw new Error('Template must be a non-empty buffer');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  if (aad) {
    cipher.setAAD(Buffer.from(String(aad)));
  }

  const ct = Buffer.concat([cipher.update(templateBuffer), cipher.final()]);

  return { iv, tag: cipher.getAuthTag(), ct };
};

const decryptTemplate = (encrypted, aad = '') => {
  if (!encrypted?.iv || !encrypted?.tag || !encrypted?.ct) {
    throw new Error('Encrypted template is incomplete');
  }

  const toBuffer = (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value.buffer || value));
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), toBuffer(encrypted.iv));

  if (aad) {
    decipher.setAAD(Buffer.from(String(aad)));
  }

  decipher.setAuthTag(toBuffer(encrypted.tag));
  return Buffer.concat([decipher.update(toBuffer(encrypted.ct)), decipher.final()]);
};

// Reads the old Student.fingerprintTemplate format ("ivHex:cipherHex", AES-256-CBC with
// sha256(FP_SECRET) as key). Only the migration script uses this; the secret must be passed in.
const decryptLegacyCbc = (value, secret) => {
  if (!secret) {
    throw new Error('Legacy secret is required to read old templates');
  }

  const [ivValue, encryptedValue] = String(value || '').trim().split(':');

  if (!ivValue || !encryptedValue) {
    throw new Error('Legacy template is not in iv:ciphertext form');
  }

  const key = crypto.createHash('sha256').update(String(secret)).digest();
  const iv = ivValue.length === 32 ? Buffer.from(ivValue, 'hex') : Buffer.from(ivValue, 'base64');
  const encrypted =
    /^[0-9a-f]+$/i.test(encryptedValue) && encryptedValue.length % 2 === 0
      ? Buffer.from(encryptedValue, 'hex')
      : Buffer.from(encryptedValue, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
};

module.exports = {
  assertBiometricKey,
  decryptLegacyCbc,
  decryptTemplate,
  encryptTemplate,
  sha256Hex,
};
