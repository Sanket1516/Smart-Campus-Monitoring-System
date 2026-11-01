// Builds synthetic .xlsx test files for bulk enrollment. Only synthetic data, never real students.
const ExcelJS = require('exceljs');

const DEFAULT_HEADERS = [
  'sapId', 'name', 'email', 'category', 'course', 'department', 'year',
  'phone', 'parentEmail', 'parentPhone', 'address', 'bloodGroup', 'hostel', 'roomNumber',
];

// 11-digit SAP IDs that never equal the template's sample ID.
const sapOf = (i) => `7100${String(i).padStart(7, '0')}`;

// Letters only: names with digits are (correctly) rejected by the validator.
const nameOf = (i) => `Student ${String(i).replace(/[0-9]/g, (d) => 'abcdefghij'[d])}`;

const makeStudent = (i, overrides = {}) => ({
  sapId: sapOf(i),
  name: nameOf(i),
  email: `test.student${i}@example.com`,
  category: 'dayscholars',
  course: 'engineering',
  department: 'computer science',
  year: 2,
  phone: `98765${String(i).padStart(5, '0')}`,
  parentEmail: `parent${i}@example.com`,
  parentPhone: `91234${String(i).padStart(5, '0')}`,
  address: '1 Test Street',
  bloodGroup: 'O+',
  hostel: '',
  roomNumber: '',
  ...overrides,
});

// A student document as it is stored by the application (for tests that insert straight into MongoDB).
const dbStudent = (i, overrides = {}) => {
  const { hostel, roomNumber, ...rest } = makeStudent(i, overrides);
  return { ...rest, ...(roomNumber ? { roomNumber } : {}), ...(hostel ? { hostel } : {}) };
};

/** rows: array of objects keyed by header name. Returns a Buffer. */
const buildXlsx = async ({ rows = [], headers = DEFAULT_HEADERS, sheetName = 'Students', extraSheets = [] } = {}) => {
  const workbook = new ExcelJS.Workbook();
  extraSheets.forEach((name) => workbook.addWorksheet(name));
  const sheet = workbook.addWorksheet(sheetName);
  if (headers.length) sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(headers.map((header) => (row[header] === undefined ? '' : row[header]))));
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

module.exports = { buildXlsx, dbStudent, makeStudent, sapOf, nameOf, DEFAULT_HEADERS };
