/**
 * AES-256-GCM encryption for fingerprint templates.
 * The key comes only from TEMPLATE_ENC_KEY (64 hex chars or base64 of 32 bytes)
 * and is never stored in the database.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const parseTemplateKey = (raw) => {
  if (!raw) {
    throw new Error('TEMPLATE_ENC_KEY is required');
  }
  const value = String(raw).trim();
  let key = null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    key = Buffer.from(value, 'hex');
  } else {
    try {
      key = Buffer.from(value, 'base64');
    } catch (_error) {
      key = null;
    }
  }
  if (!key || key.length !== 32) {
    throw new Error('TEMPLATE_ENC_KEY must be 32 bytes (64 hex chars or base64)');
  }
  return key;
};

const getKey = () => parseTemplateKey(process.env.TEMPLATE_ENC_KEY);

const keyId = (key = getKey()) =>
  crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);

/** @returns {{iv: Buffer, tag: Buffer, ciphertext: Buffer, keyId: string}} */
const encryptTemplate = (plaintext, key = getKey()) => {
  const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf8');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext, keyId: keyId(key) };
};

const decryptTemplate = ({ iv, tag, ciphertext }, key = getKey()) => {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(tag));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
};

const sha256Hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

module.exports = {
  parseTemplateKey,
  encryptTemplate,
  decryptTemplate,
  sha256Hex,
  keyId,
};
