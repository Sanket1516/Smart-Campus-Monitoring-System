/**
 * Dialect adapter. One interface (createUser, writeTemplate, deleteUser, queryUser,
 * queryTemplate, queryAllUsers, enrollFingerprint, probe) with two implementations.
 * Selected per terminal by the detected dialect stored on TerminalConfig.
 */
const { getSyncConfig } = require('../../../config/terminalSync');
const { createClassicDialect } = require('./classic');
const { createV3Dialect } = require('./v3');

const buildOptions = () => {
  const { adms } = getSyncConfig();
  return {
    sizeMode: adms.templateSizeMode,
    emptyFieldMode: adms.emptyFieldMode,
    userTable: adms.v3UserTable,
    biodataTable: adms.v3BiodataTable,
    majorVer: adms.v3MajorVer,
    minorVer: adms.v3MinorVer,
  };
};

/**
 * Resolve the effective dialect for a terminal.
 * Order: ADMS_FORCE_DIALECT > terminal.dialect (probe/manual) > "classic" fallback.
 * An "unknown" terminal is treated as classic for command building but the
 * probe is queued first, so a wrong guess fails fast and is corrected.
 */
const resolveDialectName = (terminal) => {
  const { adms } = getSyncConfig();
  if (adms.forceDialect) return adms.forceDialect;
  if (terminal?.dialect === 'v3') return 'v3';
  return 'classic';
};

const getDialect = (nameOrTerminal) => {
  const name =
    typeof nameOrTerminal === 'string' ? nameOrTerminal : resolveDialectName(nameOrTerminal);
  const options = buildOptions();
  return name === 'v3' ? createV3Dialect(options) : createClassicDialect(options);
};

module.exports = { getDialect, resolveDialectName, createClassicDialect, createV3Dialect };
