// Classic iClock push dialect. Command strings follow open-source ADMS servers that were
// run against real ZKTeco firmware (shadow046/zkteco-adms, s0x90/zkteco-adms,
// oran-soluciones/mini-asistencia). Fields are TAB-separated.
const {
  clean,
  cleanBase64,
  cleanFingerIndex,
  cleanName,
  cleanPin,
  joinFields,
} = require('./shared');

const TAB = '\t';

const createUser = (user, config) => {
  const pairs = [
    ['PIN', cleanPin(user.pin)],
    ['Name', cleanName(user.name, config.adms.maxNameLength)],
    ['Pri', clean(user.privilege ?? 0)],
    ['Passwd', clean(user.password)],
    ['Card', clean(user.card)],
    ['Grp', clean(user.group)],
    ['TZ', clean(user.timezone)],
  ];

  // UNVERIFIED: whether an empty field erases the stored value. PIN is always sent.
  const fields =
    config.adms.emptyFieldPolicy === 'omit'
      ? pairs.filter(([key, value]) => key === 'PIN' || value !== '')
      : pairs;

  return `DATA UPDATE USERINFO ${joinFields(fields, TAB)}`;
};

const writeTemplate = ({ pin, fingerIndex, flag, size, templateBase64 }) =>
  `DATA UPDATE FINGERTMP ${joinFields(
    [
      ['PIN', cleanPin(pin)],
      ['FID', cleanFingerIndex(fingerIndex)],
      ['Size', Number(size)],
      // Valid carries the template flag: 1 valid, 3 duress (duress UNVERIFIED over push).
      ['Valid', Number(flag ?? 1)],
      ['TMP', cleanBase64(templateBase64)],
    ],
    TAB
  )}`;

// The full word DELETE is required; "DATA DEL USERINFO" and "USER DEL" are rejected.
const deleteUser = ({ pin }) => `DATA DELETE USERINFO PIN=${cleanPin(pin)}`;

const queryUser = ({ pin }) => `DATA QUERY USERINFO PIN=${cleanPin(pin)}`;

const queryTemplate = ({ pin, fingerIndex }) =>
  `DATA QUERY FINGERTMP ${joinFields(
    [
      ['PIN', cleanPin(pin)],
      ['FID', cleanFingerIndex(fingerIndex)],
    ],
    TAB
  )}`;

const probe = ({ pin }) => queryUser({ pin });

module.exports = {
  name: 'classic',
  createUser,
  writeTemplate,
  deleteUser,
  queryUser,
  queryTemplate,
  probe,
};
