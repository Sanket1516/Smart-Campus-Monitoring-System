const BiometricAuditLog = require('../../models/BiometricAuditLog');

/**
 * Record a biometric operation. Never pass template data in `details`.
 * Failures to write the audit log are reported but never thrown into the caller's flow.
 */
const FORBIDDEN_KEYS = /^(tmp|template|data|dataEncrypted|templateData)$/i;

const scrub = (value, depth = 0) => {
  if (!value || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  const out = {};
  Object.entries(value).forEach(([key, inner]) => {
    if (FORBIDDEN_KEYS.test(key)) return;
    out[key] = scrub(inner, depth + 1);
  });
  return out;
};

const actorFrom = (actor) => {
  if (!actor) return { actor: 'system', actorAdmin: null };
  if (typeof actor === 'string') return { actor, actorAdmin: null };
  if (actor._id) return { actor: `admin:${actor._id}`, actorAdmin: actor._id };
  return { actor: String(actor), actorAdmin: null };
};

const recordBiometricAudit = async ({ actor, action, student = null, terminal = '', result = 'ok', details = null }) => {
  try {
    return await BiometricAuditLog.create({
      ...actorFrom(actor),
      action,
      student: student?._id || student || null,
      terminal: terminal || '',
      result,
      details: scrub(details),
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('[biometric-audit] failed to write audit log:', error.message);
    return null;
  }
};

module.exports = { recordBiometricAudit, scrub };
