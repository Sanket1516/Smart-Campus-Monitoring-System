/** Shared setup for terminal-sync tests: env vars + in-memory models. */
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.TEMPLATE_ENC_KEY = process.env.TEMPLATE_ENC_KEY || crypto.randomBytes(32).toString('hex');

const MODEL_NAMES = [
  'TerminalConfig',
  'Student',
  'TerminalCommand',
  'TerminalUserState',
  'BiometricTemplate',
  'BiometricAuditLog',
  'BiometricConsent',
  'AlertLog',
  'AttendancePunch',
  'ReconciliationReport',
  'Counter',
  'DeviceAllocation',
  'SyncJob',
];

const mockAllModels = (jestInstance, prefix = '../../models') => {
  MODEL_NAMES.forEach((name) => {
    jestInstance.mock(`${prefix}/${name}`, () => require('./models')[name]());
  });
};

const resetModels = () => {
  MODEL_NAMES.forEach((name) => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const model = require(`../../models/${name}`);
    if (model._reset) model._reset();
  });
};

module.exports = { MODEL_NAMES, mockAllModels, resetModels };
