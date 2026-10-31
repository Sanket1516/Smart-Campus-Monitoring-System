/**
 * Newer "v3" push dialect (user / biodata tables).
 *
 * UNVERIFIED: only "DATA UPDATE biodata ... Type=1 ... Tmp=.." is confirmed by the report.
 * Field names and the user-table syntax follow the open-source push references and
 * must be checked against captured X990 traffic. Table names and version fields are
 * configurable (ADMS_V3_*).
 */
const {
  assertPin,
  assertFingerIndex,
  assertFlag,
  assertTemplate,
  clean,
  joinFields,
  optionalField,
} = require('./common');

const createV3Dialect = (options = {}) => {
  const {
    emptyFieldMode = 'omit',
    userTable = 'user',
    biodataTable = 'biodata',
    majorVer = '',
    minorVer = '',
  } = options;

  return {
    name: 'v3',

    createUser({ pin, name, privilege = 0, password = '', card = '', group = 1 }) {
      return `DATA UPDATE ${userTable} ${joinFields([
        ['CardNo', optionalField(card, emptyFieldMode)],
        ['Pin', assertPin(pin)],
        ['Password', optionalField(password, emptyFieldMode)],
        ['Group', Number(group) || 1],
        ['StartTime', 0],
        ['EndTime', 0],
        ['Name', clean(name, 24)],
        ['Privilege', Number(privilege) || 0],
      ])}`;
    },

    writeTemplate({ pin, fingerIndex, flag = 1, template }) {
      const normalizedFlag = assertFlag(flag);
      return `DATA UPDATE ${biodataTable} ${joinFields([
        ['Pin', assertPin(pin)],
        ['No', assertFingerIndex(fingerIndex)],
        ['Index', 0],
        ['Valid', normalizedFlag === 0 ? 0 : 1],
        ['Duress', normalizedFlag === 3 ? 1 : 0],
        ['Type', 1],
        ['MajorVer', majorVer || undefined],
        ['MinorVer', minorVer || undefined],
        ['Format', 0],
        ['Tmp', assertTemplate(template)],
      ])}`;
    },

    deleteUser({ pin }) {
      return `DATA DELETE ${userTable} Pin=${assertPin(pin)}`;
    },

    queryUser({ pin }) {
      return `DATA QUERY ${userTable} Pin=${assertPin(pin)}`;
    },

    queryTemplate({ pin, fingerIndex }) {
      const fields = [['Pin', assertPin(pin)], ['Type', 1]];
      if (fingerIndex !== undefined && fingerIndex !== null) {
        fields.push(['No', assertFingerIndex(fingerIndex)]);
      }
      return `DATA QUERY ${biodataTable} ${joinFields(fields)}`;
    },

    queryAllUsers() {
      return `DATA QUERY ${userTable}`;
    },

    enrollFingerprint({ pin, fingerIndex, retry = 3, overwrite = 1 }) {
      return `ENROLL_BIO ${joinFields([
        ['TYPE', 1],
        ['PIN', assertPin(pin)],
        ['CardNo', ''],
        ['FID', assertFingerIndex(fingerIndex)],
        ['RETRY', Number(retry)],
        ['OVERWRITE', Number(overwrite)],
      ])}`;
    },

    probe({ pin }) {
      return this.queryUser({ pin });
    },
  };
};

module.exports = { createV3Dialect };
