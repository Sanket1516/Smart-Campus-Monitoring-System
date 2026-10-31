// Newer "v3" push dialect (user and biodata tables). UNVERIFIED: only one open-source
// project documents these strings (ecosoft-frappe/thai_zkt), with no tested device listed.
// The separator, field order, No/Index meaning and Majorver/Minorver are configurable
// and must be confirmed on hardware before use.
const {
  clean,
  cleanBase64,
  cleanFingerIndex,
  cleanName,
  cleanPin,
  joinFields,
} = require('./shared');

const separatorOf = (config) => (config.adms.v3FieldSeparator === 'space' ? ' ' : '\t');

const createUser = (user, config) => {
  const pairs = [
    ['CardNo', clean(user.card)],
    ['Pin', cleanPin(user.pin)],
    ['Password', clean(user.password)],
    ['Group', clean(user.group)],
    ['StartTime', '0'],
    ['EndTime', '0'],
    ['Name', cleanName(user.name, config.adms.maxNameLength)],
    ['Privilege', clean(user.privilege ?? 0)],
  ];

  const fields =
    config.adms.emptyFieldPolicy === 'omit'
      ? pairs.filter(([key, value]) => key === 'Pin' || value !== '')
      : pairs;

  return `DATA UPDATE user ${joinFields(fields, separatorOf(config))}`;
};

const writeTemplate = ({ pin, fingerIndex, flag, templateBase64 }, config) => {
  const templateFlag = Number(flag ?? 1);

  return `DATA UPDATE biodata ${joinFields(
    [
      ['Pin', cleanPin(pin)],
      // UNVERIFIED: No = finger index, Index = sub-template index.
      ['No', cleanFingerIndex(fingerIndex)],
      ['Index', 0],
      ['Valid', templateFlag === 0 ? 0 : 1],
      ['Duress', templateFlag === 3 ? 1 : 0],
      // Type=1 is fingerprint in the v3 biodata table.
      ['Type', 1],
      ['Majorver', clean(config.adms.v3BiodataMajorVer)],
      ['Minorver', clean(config.adms.v3BiodataMinorVer)],
      ['Format', 0],
      ['Tmp', cleanBase64(templateBase64)],
    ],
    separatorOf(config)
  )}`;
};

const deleteUser = ({ pin }) => `DATA DELETE user Pin=${cleanPin(pin)}`;

const queryUser = ({ pin }) => `DATA QUERY tablename=user,fielddesc=*,filter=Pin=${cleanPin(pin)}`;

// UNVERIFIED: whether the filter can combine Pin and finger number; Pin only is used.
const queryTemplate = ({ pin }) =>
  `DATA QUERY tablename=biodata,fielddesc=*,filter=Pin=${cleanPin(pin)}`;

const probe = ({ pin }) => queryUser({ pin });

module.exports = {
  name: 'v3',
  createUser,
  writeTemplate,
  deleteUser,
  queryUser,
  queryTemplate,
  probe,
};
