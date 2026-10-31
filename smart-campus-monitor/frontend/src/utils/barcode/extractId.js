// Turns a decoded barcode payload into a student ID. Decoding is NOT verification: the backend
// still decides whether the ID belongs to a registered, authorised student.
//
// Config (frontend/.env, all optional):
//   VITE_SAP_ID_PATTERN  regex body for a valid ID            default \d{9,11}
//   VITE_SAP_ID_EXTRACT  regex with ONE capture group, tried first, for payloads that wrap the ID
//                        (e.g. ^SAP:(\d{11})$ or ^[A-Z](\d{11})\d$)
// IDs are always handled as strings so leading zeros survive.

export const DEFAULT_PATTERN = String.raw`\d{9,11}`;

// Only invisible control / zero-width characters are stripped; everything else is left untouched.
const INVISIBLE = /[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g;

// Student-card barcodes may include extra digits after the SAP ID. Use the first 11 digits.
export const firstElevenDigits = (payload) =>
  (String(payload ?? '').replace(INVISIBLE, '').match(/\d/g) || []).slice(0, 11).join('');

export const getIdConfig = () => ({
  pattern: import.meta.env?.VITE_SAP_ID_PATTERN || DEFAULT_PATTERN,
  extract: import.meta.env?.VITE_SAP_ID_EXTRACT || '',
});

/**
 * @returns {{ ok: true, value: string } | { ok: false, reason: 'empty' | 'invalid' }}
 */
export const extractStudentId = (payload, config = getIdConfig()) => {
  const raw = String(payload ?? '').replace(INVISIBLE, '').trim();
  if (!raw) return { ok: false, reason: 'empty' };

  if (config.extract) {
    const wrapped = raw.match(new RegExp(config.extract));
    if (wrapped?.[1]) return { ok: true, value: wrapped[1] };
  }

  // The whole payload is the ID.
  if (new RegExp(`^(?:${config.pattern})$`).test(raw)) return { ok: true, value: raw };

  // The ID is a standalone token inside a longer payload (never a slice of a longer run of digits).
  const token = raw.match(new RegExp(`(?<![A-Za-z0-9])(${config.pattern})(?![A-Za-z0-9])`));
  if (token) return { ok: true, value: token[1] };

  return { ok: false, reason: 'invalid' };
};
