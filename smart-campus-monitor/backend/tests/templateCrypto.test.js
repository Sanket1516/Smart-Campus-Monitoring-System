const crypto = require('crypto');
const {
  assertBiometricKey,
  decryptLegacyCbc,
  decryptTemplate,
  encryptTemplate,
  sha256Hex,
} = require('../services/templateCrypto');

const KEY = crypto.randomBytes(32).toString('hex');

describe('templateCrypto', () => {
  const savedKey = process.env.BIOMETRIC_KEY;

  beforeEach(() => {
    process.env.BIOMETRIC_KEY = KEY;
  });

  afterAll(() => {
    if (savedKey === undefined) {
      delete process.env.BIOMETRIC_KEY;
    } else {
      process.env.BIOMETRIC_KEY = savedKey;
    }
  });

  it('round-trips a template with AES-256-GCM', () => {
    const template = crypto.randomBytes(1214);
    const encrypted = encryptTemplate(template, 'student1:6');

    expect(encrypted.ct.equals(template)).toBe(false);
    expect(decryptTemplate(encrypted, 'student1:6').equals(template)).toBe(true);
  });

  it('refuses a ciphertext moved to another record', () => {
    const encrypted = encryptTemplate(Buffer.from('template'), 'student1:6');
    expect(() => decryptTemplate(encrypted, 'student2:6')).toThrow();
  });

  it('refuses a tampered ciphertext', () => {
    const encrypted = encryptTemplate(Buffer.from('template'), 'a');
    encrypted.ct[0] ^= 0xff;
    expect(() => decryptTemplate(encrypted, 'a')).toThrow();
  });

  it('fails without a valid key', () => {
    delete process.env.BIOMETRIC_KEY;
    expect(() => assertBiometricKey()).toThrow('BIOMETRIC_KEY');

    process.env.BIOMETRIC_KEY = 'too-short';
    expect(() => encryptTemplate(Buffer.from('x'))).toThrow('BIOMETRIC_KEY');
  });

  it('accepts a base64 key', () => {
    process.env.BIOMETRIC_KEY = crypto.randomBytes(32).toString('base64');
    expect(assertBiometricKey()).toBe(true);
  });

  it('hashes template bytes with SHA-256', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('reads the legacy iv:ciphertext CBC format used by the old enrollment controller', () => {
    const secret = 'legacy-secret';
    const template = Buffer.from('old template bytes');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      crypto.createHash('sha256').update(secret).digest(),
      iv
    );
    const legacy = `${iv.toString('hex')}:${Buffer.concat([cipher.update(template), cipher.final()]).toString('hex')}`;

    expect(decryptLegacyCbc(legacy, secret).equals(template)).toBe(true);
    expect(() => decryptLegacyCbc(legacy, '')).toThrow('Legacy secret');
  });
});
