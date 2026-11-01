process.env.NODE_ENV = 'test';
const ExcelJS = require('exceljs');
const { buildTemplate } = require('../services/bulkEnrollment/template');
const { parseWorkbook, BulkEnrollmentError } = require('../services/bulkEnrollment/parser');
const { validateStudentRow } = require('../services/bulkEnrollment/validator');
const { buildReport, safeCell } = require('../services/bulkEnrollment/report');
const { COLUMNS } = require('../services/bulkEnrollment/columns');
const { buildXlsx, makeStudent, sapOf } = require('./helpers/bulkFiles');

const HOSTEL_ID = new (require('mongoose').Types.ObjectId)();
const hostels = new Map([
  ['north hostel', { _id: HOSTEL_ID, name: 'North Hostel' }],
  ['nh', { _id: HOSTEL_ID, name: 'North Hostel' }],
]);
const validate = (overrides) => validateStudentRow(makeStudent(1, overrides), { hostels });
const errorsOf = (result) => result.issues.filter((i) => i.severity === 'error');
const fieldsWithError = (result) => errorsOf(result).map((i) => i.field);

describe('A. Excel template', () => {
  let workbook;
  beforeAll(async () => {
    const built = await buildTemplate({ hostels: [{ name: 'North Hostel', code: 'NH' }] });
    // Round-trip through a real .xlsx buffer, exactly as a downloaded file would be read.
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await built.xlsx.writeBuffer());
  });

  it('has the Students, Instructions and Lists sheets', () => {
    expect(workbook.worksheets.map((w) => w.name)).toEqual(['Students', 'Instructions', 'Lists']);
  });

  it('uses exactly the real Student schema columns as headers', () => {
    const headers = workbook.getWorksheet('Students').getRow(1).values.slice(1);
    expect(headers).toEqual(COLUMNS.map((c) => c.header));
    ['sapId', 'name', 'email', 'category', 'course', 'department', 'parentEmail', 'hostel'].forEach((h) => expect(headers).toContain(h));
  });

  it('has a sample row that the validator itself rejects (cannot be enrolled by accident)', async () => {
    const parsed = await parseWorkbook({ buffer: Buffer.from(await workbook.xlsx.writeBuffer()), originalname: 't.xlsx' });
    expect(parsed.rows).toHaveLength(1);
    const result = validateStudentRow(parsed.rows[0].values, { hostels });
    expect(errorsOf(result).map((i) => i.message).join(' ')).toMatch(/sample row/i);
  });

  it('explains required vs optional fields on the Instructions sheet', () => {
    const text = workbook.getWorksheet('Instructions').getSheetValues().flat().filter(Boolean).join('\n');
    expect(text).toMatch(/REQUIRED/i);
    expect(text).toMatch(/sapId/);
    expect(text).toMatch(/Yes/);
    expect(text).toMatch(/North Hostel/);
  });

  it('adds dropdowns for fixed-value columns and a range for hostels', () => {
    const sheet = workbook.getWorksheet('Students');
    const at = (key, row = 5) => sheet.getCell(`${sheet.getColumn(COLUMNS.findIndex((c) => c.key === key) + 1).letter}${row}`).dataValidation;
    expect(at('category').type).toBe('list');
    expect(at('category').formulae[0]).toContain('dayscholars');
    expect(at('category').formulae[0]).toContain('hostellers');
    expect(at('course').formulae[0]).toContain('engineering');
    expect(at('department').formulae[0]).toContain('computer science');
    expect(at('year').type).toBe('whole');
    expect(at('hostel').formulae[0]).toMatch(/^Lists!/);
  });

  it('formats SAP ID and phone columns as text so leading zeros survive', () => {
    const sheet = workbook.getWorksheet('Students');
    expect(sheet.getCell('A5').numFmt).toBe('@');
    expect(sheet.getCell('H5').numFmt).toBe('@');
  });

  it('is directly usable as an upload: a filled-in template parses and validates', async () => {
    const filled = new ExcelJS.Workbook();
    await filled.xlsx.load(await (await buildTemplate({ hostels: [] })).xlsx.writeBuffer());
    const sheet = filled.getWorksheet('Students');
    sheet.spliceRows(2, 1); // delete the sample row, as the instructions say
    sheet.addRow(Object.values(makeStudent(7)));
    const parsed = await parseWorkbook({ buffer: Buffer.from(await filled.xlsx.writeBuffer()), originalname: 'filled.xlsx' });
    expect(parsed.rows).toHaveLength(1);
    expect(errorsOf(validateStudentRow(parsed.rows[0].values))).toEqual([]);
  });
});

describe('B. Excel parsing and file checks', () => {
  const parse = (buffer, originalname = 'students.xlsx') => parseWorkbook({ buffer, originalname });
  const rejects = async (promise, code) => {
    await expect(promise).rejects.toBeInstanceOf(BulkEnrollmentError);
    await expect(promise).rejects.toMatchObject({ code });
  };

  it('reads a valid .xlsx file with the right Excel row numbers', async () => {
    const parsed = await parse(await buildXlsx({ rows: [makeStudent(1), makeStudent(2)] }));
    expect(parsed.rows.map((r) => r.rowNumber)).toEqual([2, 3]);
    expect(parsed.rows[0].values.sapId).toBe(sapOf(1));
  });

  it('rejects an empty file, an .xls name, a wrong extension and corrupted content', async () => {
    await rejects(parse(Buffer.alloc(0)), 'EMPTY_FILE');
    await rejects(parse(Buffer.from('x'), 'old.xls'), 'UNSUPPORTED_TYPE');
    await rejects(parse(Buffer.from('a,b'), 'students.csv'), 'UNSUPPORTED_TYPE');
    await rejects(parse(Buffer.from('this is definitely not a workbook')), 'CORRUPT_FILE');
    // A real zip header followed by garbage: passes the signature check but is not a workbook.
    await rejects(parse(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('garbage garbage')])), 'CORRUPT_FILE');
    // Legacy binary .xls renamed to .xlsx
    await rejects(parse(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(50)])), 'UNSUPPORTED_TYPE');
  });

  it('rejects an empty worksheet and a headers-only worksheet', async () => {
    await rejects(parse(await buildXlsx({ headers: [], rows: [] })), 'EMPTY_SHEET');
    await rejects(parse(await buildXlsx({ rows: [] })), 'NO_ROWS');
  });

  it('reports missing required headers by name', async () => {
    const buffer = await buildXlsx({ headers: ['sapId', 'name'], rows: [{ sapId: '1', name: 'x' }] });
    await expect(parse(buffer)).rejects.toMatchObject({ code: 'MISSING_HEADERS' });
    const error = await parse(buffer).catch((e) => e);
    expect(error.details.missingHeaders).toEqual(expect.arrayContaining(['email', 'category', 'course', 'department']));
  });

  it('ignores a wrong worksheet order, blank rows and unknown columns; handles any column order', async () => {
    const headers = ['Department', 'COURSE', 'Category', 'Email', 'Name', 'SAP ID', 'Mystery Column'];
    const buffer = await buildXlsx({
      headers,
      extraSheets: ['Notes'],
      rows: [
        { 'SAP ID': sapOf(1), Name: 'A One', Email: 'a@example.com', Category: 'dayscholars', COURSE: 'engineering', Department: 'computer science', 'Mystery Column': 'x' },
        {},
        { 'SAP ID': sapOf(2), Name: 'B Two', Email: 'b@example.com', Category: 'dayscholars', COURSE: 'engineering', Department: 'computer science' },
      ],
    });
    const parsed = await parse(buffer);
    expect(parsed.rows.map((r) => r.values.sapId)).toEqual([sapOf(1), sapOf(2)]);
    expect(parsed.unknownColumns).toEqual(['Mystery Column']);
  });

  it('keeps leading zeros of text SAP IDs and renders numeric SAP IDs without float noise', async () => {
    const buffer = await buildXlsx({ rows: [makeStudent(1, { sapId: '00123456789' }), makeStudent(2, { sapId: 71000000002 })] });
    const parsed = await parse(buffer);
    expect(parsed.rows[0].values.sapId).toBe('00123456789');
    expect(parsed.rows[1].values.sapId).toBe('71000000002');
    expect(typeof parsed.rows[1].values.sapId).toBe('string');
  });

  it('trims extra spaces and strips invisible characters', async () => {
    const parsed = await parse(await buildXlsx({ rows: [makeStudent(1, { name: '  Asha   Rao​ ', sapId: ` ${sapOf(1)} ` })] }));
    expect(parsed.rows[0].values.sapId).toBe(sapOf(1));
    expect(parsed.rows[0].values.name).toBe('Asha   Rao');
  });

  it('enforces the row limit', async () => {
    process.env.BULK_MAX_ROWS = '3';
    try {
      await rejects(parse(await buildXlsx({ rows: [1, 2, 3, 4].map((i) => makeStudent(i)) })), 'TOO_MANY_ROWS');
    } finally {
      delete process.env.BULK_MAX_ROWS;
    }
  });
});

describe('C. Row validation', () => {
  it('accepts a completely valid day scholar and normalises the data', () => {
    const result = validate({ name: '  Asha   Rao ', email: 'ASHA@Example.COM' });
    expect(errorsOf(result)).toEqual([]);
    expect(result.data).toMatchObject({
      sapId: sapOf(1), name: 'Asha Rao', email: 'asha@example.com', category: 'dayscholars',
      studentType: 'day_scholar', isHosteller: false, wardenApprovalRequired: false, roomNumber: '',
    });
  });

  it.each([
    ['missing SAP ID', { sapId: '' }, 'sapId'],
    ['missing name', { name: '' }, 'name'],
    ['invalid SAP ID (letters)', { sapId: 'E265001' }, 'sapId'],
    ['SAP ID too short', { sapId: '12345' }, 'sapId'],
    ['name with digits', { name: 'R2D2' }, 'name'],
    ['invalid email', { email: 'not-an-email' }, 'email'],
    ['missing email', { email: '' }, 'email'],
    ['invalid parent email', { parentEmail: 'parent@' }, 'parentEmail'],
    ['invalid mobile number', { phone: '12ab' }, 'phone'],
    ['invalid parent mobile number', { parentPhone: '123' }, 'parentPhone'],
    ['invalid category', { category: 'visitor' }, 'category'],
    ['missing category', { category: '' }, 'category'],
    ['invalid course', { course: 'law' }, 'course'],
    ['department of another course', { course: 'engineering', department: 'bpharm' }, 'department'],
    ['year out of range', { year: 9 }, 'year'],
    ['year not a number', { year: 'second' }, 'year'],
  ])('rejects %s', (_label, overrides, field) => {
    expect(fieldsWithError(validate(overrides))).toContain(field);
  });

  it('understands category spellings but never guesses unknown ones', () => {
    expect(validate({ category: 'Day Scholar' }).data.category).toBe('dayscholars');
    expect(validate({ category: 'DAY_SCHOLARS' }).data.category).toBe('dayscholars');
    expect(validate({ category: 'hosteller', hostel: 'NH' }).data.category).toBe('hostellers');
  });

  it('requires a registered hostel for a hosteller, and resolves it by name or code', () => {
    expect(fieldsWithError(validate({ category: 'hostellers', hostel: '' }))).toContain('hostel');
    expect(fieldsWithError(validate({ category: 'hostellers', hostel: 'Unknown Block' }))).toContain('hostel');
    const byName = validate({ category: 'hostellers', hostel: 'north hostel', roomNumber: 'B-204' });
    const byCode = validate({ category: 'hostellers', hostel: 'NH' });
    expect(errorsOf(byName)).toEqual([]);
    expect(byName.data).toMatchObject({ hostel: HOSTEL_ID, roomNumber: 'B-204', studentType: 'hosteller', isHosteller: true, wardenApprovalRequired: true });
    expect(byCode.data.hostel).toBe(HOSTEL_ID);
    expect(byCode.issues.some((i) => i.field === 'roomNumber' && i.severity === 'warning')).toBe(true); // room is optional
  });

  it('does not reject a day scholar for empty hostel fields, and ignores hostel details if given', () => {
    const empty = validate({ hostel: '', roomNumber: '' });
    expect(errorsOf(empty)).toEqual([]);
    const given = validate({ hostel: 'NH', roomNumber: '12' });
    expect(errorsOf(given)).toEqual([]);
    expect(given.data.hostel).toBeUndefined();
    expect(given.data.roomNumber).toBe('');
  });

  it('allows every optional field to be blank, with a warning when there is no parent contact', () => {
    const result = validate({ year: '', phone: '', parentEmail: '', parentPhone: '', address: '', bloodGroup: '' });
    expect(errorsOf(result)).toEqual([]);
    expect(result.issues.some((i) => i.severity === 'warning' && /parent/i.test(i.message))).toBe(true);
    expect(result.data.year).toBeUndefined();
  });

  it('accepts long names up to 100 characters and rejects longer', () => {
    expect(errorsOf(validate({ name: 'A'.repeat(100) }))).toEqual([]);
    expect(fieldsWithError(validate({ name: 'A'.repeat(101) }))).toContain('name');
  });

  it('accepts international names with punctuation', () => {
    expect(errorsOf(validate({ name: "Mary-Anne O'Neil Jr." }))).toEqual([]);
    expect(errorsOf(validate({ name: 'Śrī Rāma' }))).toEqual([]);
  });

  it('accepts formatted phone numbers and a +91 prefix', () => {
    const result = validate({ phone: '+91 98765-43210', parentPhone: '(022) 2345 6789' });
    expect(errorsOf(result)).toEqual([]);
    expect(result.data.phone).toBe('+919876543210');
  });

  it('never alters the SAP ID (leading zeros stay)', () => {
    expect(validate({ sapId: '00123456789' }).data.sapId).toBe('00123456789');
  });
});

describe('Report generation', () => {
  it('neutralises spreadsheet formula injection', () => {
    ['=cmd|calc', '+1+1', '-2+3', '@SUM(A1)', '\t=x'].forEach((value) => expect(safeCell(value)).toBe(`'${value}`));
    expect(safeCell('Asha Rao')).toBe('Asha Rao');
    expect(safeCell(42)).toBe(42);
  });

  it('writes injected values safely into a real report and keeps the Excel row number', async () => {
    const job = {
      fileName: '=evil.xlsx', status: 'completed_with_errors', startedAt: null, finishedAt: null,
      totals: { rows: 1, blankRows: 0, valid: 0, invalid: 1, duplicateInFile: 0, existing: 0 },
      progress: { enrolled: 0, failed: 0, skipped: 0 },
      rows: [{ rowNumber: 17, status: 'invalid', issues: [{ severity: 'error', field: 'name', message: 'bad' }], raw: { sapId: '1', name: '=HYPERLINK("http://x")' } }],
    };
    const { workbook } = await buildReport(job, 'invalid');
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(await workbook.xlsx.writeBuffer());
    const sheet = reloaded.getWorksheet('invalid');
    expect(sheet.getRow(2).getCell(1).value).toBe(17);
    expect(String(sheet.getRow(2).getCell(3).value)).toBe(`'=HYPERLINK("http://x")`);
    expect(String(reloaded.getWorksheet('Summary').getRow(2).getCell(2).value)).toBe("'=evil.xlsx");
  });
});
