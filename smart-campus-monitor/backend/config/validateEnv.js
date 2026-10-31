/**
 * Fail fast when required secrets are missing. There are no development fallbacks.
 */
const { parseTemplateKey } = require('../services/sync/templateCrypto');
const { getSyncConfig } = require('./terminalSync');

const validateEnv = (env = process.env) => {
  const errors = [];

  ['MONGO_URI', 'JWT_SECRET', 'TEMPLATE_ENC_KEY'].forEach((name) => {
    if (!env[name] || !String(env[name]).trim()) {
      errors.push(`${name} is required`);
    }
  });

  if (env.JWT_SECRET && String(env.JWT_SECRET).length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  if (env.TEMPLATE_ENC_KEY) {
    try {
      parseTemplateKey(env.TEMPLATE_ENC_KEY);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (env.NODE_ENV === 'production' && (env.SIMULATION_MODE === 'true' || env.SIDECAR_FAKE === 'true')) {
    errors.push('SIMULATION_MODE / SIDECAR_FAKE must not be enabled in production');
  }

  if (env.LEGACY_ZK_DIRECT_SYNC === 'true' && !env.FP_SECRET) {
    errors.push('FP_SECRET is required when LEGACY_ZK_DIRECT_SYNC=true');
  }

  if (env.SIDECAR_URL && (!env.SIDECAR_SECRET || String(env.SIDECAR_SECRET).length < 24)) {
    errors.push('SIDECAR_SECRET (min 24 chars) is required when SIDECAR_URL is set');
  }

  try {
    const config = getSyncConfig();
    if (
      (config.adms.tlsKeyPath && !config.adms.tlsCertPath) ||
      (!config.adms.tlsKeyPath && config.adms.tlsCertPath)
    ) {
      errors.push('ADMS_TLS_KEY and ADMS_TLS_CERT must be set together');
    }
    if (env.NODE_ENV === 'production' && !config.adms.allowedCidrs.length) {
      errors.push('ADMS_ALLOWED_CIDRS is required in production (terminal VLAN ranges)');
    }
  } catch (error) {
    errors.push(error.message);
  }

  if (errors.length) {
    const error = new Error(`Invalid environment:\n - ${errors.join('\n - ')}`);
    error.validationErrors = errors;
    throw error;
  }

  return true;
};

module.exports = { validateEnv };
