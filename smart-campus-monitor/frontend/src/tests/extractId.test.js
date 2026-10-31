import { describe, expect, it } from 'vitest';
import { extractStudentId } from '../utils/barcode/extractId';

const cfg = (extra = {}) => ({ pattern: String.raw`\d{9,11}`, extract: '', ...extra });

describe('extractStudentId', () => {
  it('returns the exact payload and preserves leading zeros', () => {
    expect(extractStudentId('00123456789', cfg())).toEqual({ ok: true, value: '00123456789' });
    expect(extractStudentId('70552300067', cfg())).toEqual({ ok: true, value: '70552300067' });
  });

  it('strips only invisible control characters and surrounding whitespace', () => {
    expect(extractStudentId('\u0000 70552300067\r\n', cfg())).toEqual({ ok: true, value: '70552300067' });
    expect(extractStudentId('\ufeff70552300067\u200b', cfg()).value).toBe('70552300067');
  });

  it('never slices an ID out of a longer run of digits (e.g. an EAN-13 product code)', () => {
    expect(extractStudentId('5901234123457', cfg())).toEqual({ ok: false, reason: 'invalid' });
    expect(extractStudentId('123456789012345', cfg())).toEqual({ ok: false, reason: 'invalid' });
  });

  it('finds a standalone ID token inside a longer payload', () => {
    expect(extractStudentId('SAP 70552300067 CSE', cfg()).value).toBe('70552300067');
  });

  it('rejects empty, short and non-matching values', () => {
    expect(extractStudentId('', cfg()).reason).toBe('empty');
    expect(extractStudentId('   ', cfg()).reason).toBe('empty');
    expect(extractStudentId(null, cfg()).reason).toBe('empty');
    expect(extractStudentId('12345', cfg()).reason).toBe('invalid');
    expect(extractStudentId('hello world', cfg()).reason).toBe('invalid');
  });

  it('supports a configurable alphanumeric pattern', () => {
    const c = cfg({ pattern: String.raw`[A-Z]\d{12}` });
    expect(extractStudentId('E265202600123', c)).toEqual({ ok: true, value: 'E265202600123' });
    expect(extractStudentId('70552300067', c).ok).toBe(false);
  });

  it('supports a configurable extraction rule for wrapped payloads', () => {
    const c = cfg({ extract: String.raw`^SAP:(\d{11})$` });
    expect(extractStudentId('SAP:70552300067', c).value).toBe('70552300067');
    expect(extractStudentId('70552300067', c).value).toBe('70552300067');
  });
});
