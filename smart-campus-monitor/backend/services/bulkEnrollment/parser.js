const ExcelJS = require('exceljs');
const { COLUMNS, HEADER_TO_KEY, headerKey } = require('./columns');
const { getBulkConfig } = require('./config');

class BulkEnrollmentError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = 'BulkEnrollmentError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];
const startsWith = (buffer, magic) => magic.every((byte, index) => buffer[index] === byte);

// Invisible/control characters are stripped; everything else is kept exactly as typed.
const CONTROL = new RegExp('[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]', 'g');

const cellText = (cell) => {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  const value = cell.value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // exceljs resolves rich text, formulas (result), hyperlinks and shared strings to display text.
  return String(cell.text ?? '').replace(CONTROL, '').trim();
};

const assertWorkbookFile = ({ buffer, originalname }) => {
  if (!buffer || buffer.length === 0) {
    throw new BulkEnrollmentError('EMPTY_FILE', 'The file is empty.');
  }
  const name = String(originalname || '').toLowerCase();
  if (!name.endsWith('.xlsx')) {
    throw new BulkEnrollmentError(
      'UNSUPPORTED_TYPE',
      name.endsWith('.xls')
        ? 'Old .xls files are not supported. Open it in Excel and use Save As > Excel Workbook (.xlsx).'
        : 'Only .xlsx files are allowed.'
    );
  }
  if (startsWith(buffer, OLE_MAGIC)) {
    throw new BulkEnrollmentError('UNSUPPORTED_TYPE', 'This is an old .xls file renamed to .xlsx. Save it as a real .xlsx workbook.');
  }
  if (!startsWith(buffer, ZIP_MAGIC)) {
    throw new BulkEnrollmentError('CORRUPT_FILE', 'The file is not a valid Excel workbook (it may be corrupted).');
  }
};

/**
 * Reads the first data worksheet. Returns every non-blank row as plain trimmed strings keyed by schema field,
 * with the Excel row number so the administrator can find it in the source file.
 */
const parseWorkbook = async ({ buffer, originalname }) => {
  const { maxRows } = getBulkConfig();
  assertWorkbookFile({ buffer, originalname });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (_error) {
    throw new BulkEnrollmentError('CORRUPT_FILE', 'The file is not a valid Excel workbook (it may be corrupted).');
  }

  const sheet =
    workbook.worksheets.find((candidate) => headerKey(candidate.name) === 'students') ||
    workbook.worksheets.find((candidate) => !['instructions', 'lists'].includes(headerKey(candidate.name)) && candidate.state === 'visible');
  if (!sheet) {
    throw new BulkEnrollmentError('NO_WORKSHEET', 'The workbook has no worksheet with student data.');
  }

  const headerRow = sheet.getRow(1);
  const columnIndex = {};
  const unknownColumns = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = cellText(cell);
    const key = HEADER_TO_KEY.get(headerKey(text));
    if (key && columnIndex[key] === undefined) columnIndex[key] = colNumber;
    else if (!key && text) unknownColumns.push(text);
  });

  if (Object.keys(columnIndex).length === 0 && sheet.actualRowCount === 0) {
    throw new BulkEnrollmentError('EMPTY_SHEET', 'The worksheet is empty.');
  }
  const missingHeaders = COLUMNS.filter((column) => column.required && columnIndex[column.key] === undefined).map((column) => column.header);
  if (missingHeaders.length) {
    throw new BulkEnrollmentError(
      'MISSING_HEADERS',
      `Missing required column(s): ${missingHeaders.join(', ')}. Download the template and keep its header row.`,
      400,
      { missingHeaders }
    );
  }

  const rows = [];
  let blankRows = 0;
  const lastRow = sheet.rowCount;
  if (lastRow - 1 > maxRows + 1000) {
    // Cheap guard before reading cell by cell (rowCount can include formatted-but-empty rows).
    let used = 0;
    for (let r = 2; r <= lastRow && used <= maxRows; r += 1) if (sheet.getRow(r).hasValues) used += 1;
    if (used > maxRows) throw new BulkEnrollmentError('TOO_MANY_ROWS', `The file has more than ${maxRows} students. Split it into smaller files.`, 413);
  }
  for (let r = 2; r <= lastRow; r += 1) {
    const row = sheet.getRow(r);
    if (!row.hasValues) {
      continue;
    }
    const values = {};
    let any = false;
    COLUMNS.forEach((column) => {
      const index = columnIndex[column.key];
      const text = index ? cellText(row.getCell(index)) : '';
      values[column.key] = text;
      if (text) any = true;
    });
    if (!any) {
      blankRows += 1;
      continue;
    }
    rows.push({ rowNumber: r, values });
    if (rows.length > maxRows) {
      throw new BulkEnrollmentError('TOO_MANY_ROWS', `The file has more than ${maxRows} students. Split it into smaller files.`, 413);
    }
  }

  if (rows.length === 0) {
    throw new BulkEnrollmentError('NO_ROWS', 'The worksheet has headers but no student rows.');
  }
  return { sheetName: sheet.name, rows, blankRows, unknownColumns };
};

module.exports = { parseWorkbook, BulkEnrollmentError, cellText };
