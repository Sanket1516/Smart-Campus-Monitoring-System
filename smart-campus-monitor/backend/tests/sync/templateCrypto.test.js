const crypto = require('crypto');
const { encryptTemplate, decryptTemplate, parseTemplateKey, sha256Hex } = require('../../services/sync/templateCrypto');

describe('template encryption (AES-256-GCM)', () => {
  const key = crypto.randomBytes(32);

  it('round-trips the exact uploaded value', () => {
    const original = Buffer.from(crypto.randomBytes(700).toString('base64'), 'utf8');
    const encrypted = encryptTemplate(original, key);
    expect(encrypted.ciphertext.equals(original)).toBe(false);
    expect(encrypted.iv).toHaveLength(12);
    expect(decryptTemplate(encrypted, key).equals(original)).toBe(true);
  });

  it('uses a fresh IV each time', () => {
    const a = encryptTemplate('same', key);
    const b = encryptTemplate('same', key);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('detects tampering and wrong keys', () => {
    const encrypted = encryptTemplate('template', key);
    const tampered = { ...encrypted, ciphertext: Buffer.from(encrypted.ciphertext) };
    tampered.ciphertext[0] ^= 0xff;
    expect(() => decryptTemplate(tampered, key)).toThrow();
    expect(() => decryptTemplate(encrypted, crypto.randomBytes(32))).toThrow();
  });

  it('accepts only 32-byte keys (hex or base64)', () => {
    expect(parseTemplateKey(key.toString('hex'))).toHaveLength(32);
    expect(parseTemplateKey(key.toString('base64'))).toHaveLength(32);
    expect(() => parseTemplateKey('')).toThrow(/required/);
    expect(() => parseTemplateKey('short')).toThrow(/32 bytes/);
  });

  it('hashes bytes with SHA-256', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('startup secret validation', () => {
  const { validateEnv } = require('../../config/validateEnv');
  const good = {
    MONGO_URI: 'mongodb://localhost/x',
    JWT_SECRET: 'x'.repeat(40),
    TEMPLATE_ENC_KEY: crypto.randomBytes(32).toString('hex'),
  };

  it('passes with all required secrets', () => {
    expect(validateEnv(good)).toBe(true);
  });

  it.each(['MONGO_URI', 'JWT_SECRET', 'TEMPLATE_ENC_KEY'])('fails when %s is missing', (name) => {
    const env = { ...good };
    delete env[name];
    expect(() => validateEnv(env)).toThrow(new RegExp(name));
  });

  it('fails on weak JWT secret, bad key, sidecar without secret, legacy without FP_SECRET', () => {
    expect(() => validateEnv({ ...good, JWT_SECRET: 'short' })).toThrow(/at least 32/);
    expect(() => validateEnv({ ...good, TEMPLATE_ENC_KEY: 'abc' })).toThrow(/32 bytes/);
    expect(() => validateEnv({ ...good, SIDECAR_URL: 'http://127.0.0.1:8770' })).toThrow(/SIDECAR_SECRET/);
    expect(() => validateEnv({ ...good, LEGACY_ZK_DIRECT_SYNC: 'true' })).toThrow(/FP_SECRET/);
  });
});
