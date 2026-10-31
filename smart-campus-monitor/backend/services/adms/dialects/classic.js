/**
 * Classic ADMS push dialect (DATA ... USERINFO / FINGERTMP).
 * USER ADD / USER DEL fail with -1002 on these firmwares; only DATA commands are used.
 */
const {
  assertPin,
  assertFingerIndex,
  assertFlag,
  assertTemplate,
  clean,
  computeTemplateSize,
  joinFields,
  optionalField,
} = require('./common');

const createClassicDialect = (options = {}) => {
  const { sizeMode = 'bytes', emptyFieldMode = 'omit' } = options;

  return {
    name: 'classic',

    createUser({ pin, name, privilege = 0, password = '', card = '', group = 1, timezone = '' }) {
      return `DATA UPDATE USERINFO ${joinFields([
        ['PIN', assertPin(pin)],
        ['Name', clean(name, 24)],
        ['Pri', Number(privilege) || 0],
        ['Passwd', optionalField(password, emptyFieldMode)],
        ['Card', optionalField(card, emptyFieldMode)],
        ['Grp', Number(group) || 1],
        ['TZ', optionalField(timezone, emptyFieldMode)],
      ])}`;
    },

    writeTemplate({ pin, fingerIndex, flag = 1, template, size }) {
      const tmp = assertTemplate(template);
      return `DATA UPDATE FINGERTMP ${joinFields([
        ['PIN', assertPin(pin)],
        ['FID', assertFingerIndex(fingerIndex)],
        ['Size', size ?? computeTemplateSize(tmp, sizeMode)],
        ['Valid', assertFlag(flag)],
        ['TMP', tmp],
      ])}`;
    },

    deleteUser({ pin }) {
      return `DATA DELETE USERINFO PIN=${assertPin(pin)}`;
    },

    queryUser({ pin }) {
      return `DATA QUERY USERINFO PIN=${assertPin(pin)}`;
    },

    // UNVERIFIED: exact classic syntax for querying one finger.
    queryTemplate({ pin, fingerIndex }) {
      const fields = [['PIN', assertPin(pin)]];
      if (fingerIndex !== undefined && fingerIndex !== null) {
        fields.push(['FID', assertFingerIndex(fingerIndex)]);
      }
      return `DATA QUERY FINGERTMP ${joinFields(fields)}`;
    },

    // UNVERIFIED: query without a PIN to list every user.
    queryAllUsers() {
      return 'DATA QUERY USERINFO';
    },

    // UNVERIFIED: remote enrolment over push.
    enrollFingerprint({ pin, fingerIndex, retry = 3, overwrite = 1 }) {
      return `ENROLL_FP ${joinFields([
        ['PIN', assertPin(pin)],
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

module.exports = { createClassicDialect };
