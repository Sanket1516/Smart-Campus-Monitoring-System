const classic = require('./classic');
const v3 = require('./v3');

const DIALECT_ADAPTERS = { classic, v3 };

const getDialectAdapter = (name) => {
  const adapter = DIALECT_ADAPTERS[name];

  if (!adapter) {
    throw new Error(`No adapter for dialect "${name}"`);
  }

  return adapter;
};

// The dialect a command should be rendered in, or null when it must wait for detection.
const effectiveDialect = (terminal, config) => {
  if (config.adms.dialectOverride) {
    return config.adms.dialectOverride;
  }

  if (terminal?.dialect === 'classic' || terminal?.dialect === 'v3') {
    return terminal.dialect;
  }

  return config.adms.unknownDialectPolicy === 'hold' ? null : config.adms.unknownDialectPolicy;
};

// Classic firmware answers v3 commands with -1 or -1004, and the reverse is reported too.
// A dialect is accepted only when its probe returns 0 and the other probe does not.
const resolveDialectFromProbes = ({ classicReturn, v3Return }) => {
  const classicOk = classicReturn === 0;
  const v3Ok = v3Return === 0;
  const answered = (code) => code !== null && code !== undefined;

  if (classicOk && answered(v3Return) && !v3Ok) {
    return 'classic';
  }

  if (v3Ok && answered(classicReturn) && !classicOk) {
    return 'v3';
  }

  return 'unknown';
};

// Size field for FINGERTMP. UNVERIFIED unit, so the mode is configurable.
const computeTemplateSize = ({ sizeReported, byteLength, templateBase64 }, config) => {
  const mode =
    config.adms.fingertmpSizeMode === 'as_uploaded'
      ? Number.isFinite(sizeReported) && sizeReported > 0
        ? 'as_uploaded'
        : config.adms.fingertmpSizeFallback
      : config.adms.fingertmpSizeMode;

  if (mode === 'as_uploaded') {
    return sizeReported;
  }

  return mode === 'base64_chars' ? templateBase64.length : byteLength;
};

// Replaces a template value with its hash so command text can be stored and logged.
const redactCommandText = (text, sha256 = '') =>
  String(text).replace(/(\b(?:TMP|Tmp)=)[^\t ]*/g, `$1<redacted${sha256 ? ` sha256:${sha256}` : ''}>`);

module.exports = {
  DIALECT_ADAPTERS,
  computeTemplateSize,
  effectiveDialect,
  getDialectAdapter,
  redactCommandText,
  resolveDialectFromProbes,
};
