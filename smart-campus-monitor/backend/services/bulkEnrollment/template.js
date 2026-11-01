const ExcelJS = require('exceljs');
const { COURSE_OPTIONS, DEPARTMENT_OPTIONS } = require('../../utils/studentMeta');
const { COLUMNS, CATEGORY_VALUES } = require('./columns');
const { getBulkConfig } = require('./config');

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
const REQUIRED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C1C' } };

const listFormula = (values) => `"${values.join(',')}"`;

/**
 * Builds the official template: Students sheet (headers, sample row, dropdowns, text formats),
 * Instructions sheet and a hidden Lists sheet that feeds the hostel dropdown.
 * `hostels` is an array of { name, code } read from the database.
 */
const buildTemplate = async ({ hostels = [] } = {}) => {
  const { maxRows, maxFileBytes } = getBulkConfig();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smart Campus Monitor';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Students', { views: [{ state: 'frozen', ySplit: 1 }] });
  const instructions = workbook.addWorksheet('Instructions');
  const lists = workbook.addWorksheet('Lists', { state: 'hidden' });

  // Lists sheet: hostels (column A) so the dropdown always matches what is registered.
  lists.getCell('A1').value = 'Registered hostels';
  const hostelNames = hostels.map((hostel) => hostel.name).filter(Boolean);
  hostelNames.forEach((hostelName, index) => {
    lists.getCell(`A${index + 2}`).value = hostelName;
  });

  sheet.columns = COLUMNS.map((column) => ({ header: column.header, key: column.key, width: column.width }));
  const header = sheet.getRow(1);
  COLUMNS.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = column.required ? REQUIRED_FILL : HEADER_FILL;
    cell.alignment = { vertical: 'middle' };
    cell.note = `${column.required ? 'REQUIRED. ' : 'Optional. '}${column.help}`;
  });
  header.height = 22;

  // Sample row (clearly fake; the validator rejects it so it cannot be enrolled by accident).
  sheet.addRow(Object.fromEntries(COLUMNS.map((column) => [column.key, column.example])));
  sheet.getRow(2).font = { italic: true, color: { argb: 'FF6B7280' } };

  const lastRow = maxRows + 1;
  COLUMNS.forEach((column, index) => {
    const colNumber = index + 1;
    const letter = sheet.getColumn(colNumber).letter;
    for (let r = 2; r <= lastRow; r += 1) {
      const cell = sheet.getCell(`${letter}${r}`);
      if (column.text) cell.numFmt = '@'; // keep SAP IDs / phone numbers as text (leading zeros survive)
      if (column.key === 'category') {
        cell.dataValidation = { type: 'list', allowBlank: true, formulae: [listFormula(CATEGORY_VALUES)], showErrorMessage: true, errorTitle: 'Category', error: 'Choose dayscholars or hostellers' };
      } else if (column.key === 'course') {
        cell.dataValidation = { type: 'list', allowBlank: true, formulae: [listFormula(COURSE_OPTIONS)], showErrorMessage: true, errorTitle: 'Course', error: `Choose one of: ${COURSE_OPTIONS.join(', ')}` };
      } else if (column.key === 'department') {
        const departments = [...new Set(Object.values(DEPARTMENT_OPTIONS).flat())];
        cell.dataValidation = { type: 'list', allowBlank: true, formulae: [listFormula(departments)], showErrorMessage: true, errorTitle: 'Department', error: 'Choose a department that matches the course' };
      } else if (column.key === 'year') {
        cell.dataValidation = { type: 'whole', operator: 'between', allowBlank: true, formulae: [1, 5], showErrorMessage: true, errorTitle: 'Year', error: 'Year must be a whole number from 1 to 5' };
      } else if (column.key === 'hostel' && hostelNames.length) {
        cell.dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$A$2:$A$${hostelNames.length + 1}`], showErrorMessage: true, errorTitle: 'Hostel', error: 'Choose a registered hostel' };
      }
    }
  });

  // Instructions sheet
  instructions.columns = [{ width: 18 }, { width: 12 }, { width: 90 }];
  instructions.addRow(['Bulk student enrollment: how to use this file']).font = { bold: true, size: 14 };
  [
    '1. Fill the Students sheet, one student per row. Delete the grey sample row (row 2) first.',
    '2. Columns marked REQUIRED (red header) must be filled. Dropdowns appear where the value must come from a fixed list.',
    '3. Upload the file in Student Management > Upload Excel. Nothing is saved until you review the preview and confirm.',
    `4. Limits: .xlsx only, up to ${Math.round(maxFileBytes / (1024 * 1024))} MB and ${maxRows} students per file.`,
    '5. Hostellers need a registered hostel. Day scholars must leave hostel and roomNumber empty.',
    '6. SAP IDs that already exist are skipped, never overwritten. Fingerprints are enrolled separately on the terminals.',
  ].forEach((line) => instructions.addRow([line]));
  instructions.addRow([]);
  const tableHeader = instructions.addRow(['Column', 'Required', 'Allowed values / format']);
  tableHeader.font = { bold: true };
  COLUMNS.forEach((column) => instructions.addRow([column.header, column.required ? 'Yes' : 'No', column.help]));
  instructions.addRow([]);
  instructions.addRow(['Registered hostels', '', hostelNames.length ? hostelNames.join(', ') : '(none registered yet: add hostels before enrolling hostellers)']);

  return workbook;
};

module.exports = { buildTemplate };
