/**
 * Bulk enrollment: integration + end-to-end tests.
 * Real Express app, real JWT auth, real (in-memory) MongoDB with the real unique indexes, real .xlsx files.
 * Only the outside world is stubbed: sockets, background jobs, terminal sync hooks and e-mail sending.
 */
jest.setTimeout(120000);

jest.mock('express-rate-limit', () => () => (req, res, next) => next());
jest.mock('../socket', () => ({ attachSocketServer: jest.fn() }));
jest.mock('../jobs/terminalJobs', () => ({ startTerminalJobs: jest.fn() }));
jest.mock('../jobs/hostellerJobs', () => ({ startHostellerJobs: jest.fn() }));
jest.mock('../utils/metrics', () => ({
  register: { metrics: jest.fn().mockResolvedValue('metrics'), contentType: 'text/plain' },
  metricsMiddleware: (req, res, next) => next(),
}));
jest.mock('../services/notification', () => ({
  notifyParent: jest.fn().mockResolvedValue({}),
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  sendSMS: jest.fn(),
  buildSender: jest.fn(),
}));
jest.mock('../services/sync/hooks', () => {
  const fns = {};
  return new Proxy({}, { get: (_target, key) => (fns[key] = fns[key] || jest.fn(() => ({ ok: true }))) });
});

const request = require('supertest');
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const db = require('./helpers/bulkDb');
const { buildXlsx, dbStudent, makeStudent, sapOf, nameOf } = require('./helpers/bulkFiles');

let app;
let Student;
let BulkEnrollment;
let AuditLog;
let hooks;
let service;
let admin;
let security;
let warden;
let hostel;

beforeAll(async () => {
  await db.start();
  app = require('../server');
  Student = require('../models/Student');
  BulkEnrollment = require('../models/BulkEnrollment');
  AuditLog = require('../models/AuditLog');
  hooks = require('../services/sync/hooks');
  service = require('../services/bulkEnrollment');
});

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.clean();
  jest.clearAllMocks();
  admin = await db.createAdmin('admin');
  security = await db.createAdmin('security');
  hostel = await db.createHostel('North Hostel', 'NH');
  warden = await db.createAdmin('warden', hostel._id);
});

const uploadFile = (buffer, filename = 'students.xlsx', who = admin) =>
  request(app).post('/api/students/bulk/validate').set(who.auth).attach('file', buffer, filename);

const validated = async (rows, who = admin) => {
  const res = await uploadFile(await buildXlsx({ rows }), 'students.xlsx', who);
  expect(res.status).toBe(201);
  return res.body;
};

const confirm = (id, who = admin) => request(app).post(`/api/students/bulk/${id}/confirm`).set(who.auth);
const status = (id, who = admin) => request(app).get(`/api/students/bulk/${id}`).set(who.auth);
const rowsOf = (id, query = '', who = admin) => request(app).get(`/api/students/bulk/${id}/rows${query}`).set(who.auth);

const enroll = async (rows) => {
  const job = await validated(rows);
  const res = await confirm(job.id);
  expect(res.status).toBe(202);
  await service.waitForJob(job.id);
  return (await status(job.id)).body;
};

const readReport = async (id, type) => {
  const res = await request(app).get(`/api/students/bulk/${id}/report?type=${type}`).set(admin.auth).buffer(true).parse((r, cb) => {
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  expect(res.status).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.body);
  return workbook;
};

describe('Authorization (only administrators may bulk-enroll)', () => {
  const endpoints = [
    ['get', '/api/students/bulk/template'],
    ['post', '/api/students/bulk/validate'],
    ['get', `/api/students/bulk/${new mongoose.Types.ObjectId()}`],
    ['post', `/api/students/bulk/${new mongoose.Types.ObjectId()}/confirm`],
    ['get', `/api/students/bulk/${new mongoose.Types.ObjectId()}/report`],
  ];

  it.each(endpoints)('%s %s requires a login', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });

  it.each(endpoints)('%s %s refuses a security guard', async (method, url) => {
    expect((await request(app)[method](url).set(security.auth)).status).toBe(403);
  });

  it.each(endpoints)('%s %s refuses a warden', async (method, url) => {
    expect((await request(app)[method](url).set(warden.auth)).status).toBe(403);
  });

  it('a guard cannot upload a file or enroll anyone', async () => {
    const res = await uploadFile(await buildXlsx({ rows: [makeStudent(1)] }), 'students.xlsx', security);
    expect(res.status).toBe(403);
    expect(await Student.countDocuments()).toBe(0);
    expect(await BulkEnrollment.countDocuments()).toBe(0);
  });

  it('the old one-step upload endpoint is retired (410) and still admin-only', async () => {
    expect((await request(app).post('/api/students/upload').set(admin.auth)).status).toBe(410);
    expect((await request(app).post('/api/students/upload').set(security.auth)).status).toBe(403);
  });
});

describe('A. Template download', () => {
  it('downloads a real workbook whose headers match the upload format', async () => {
    const res = await request(app).get('/api/students/bulk/template').set(admin.auth).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    expect(res.headers['content-disposition']).toMatch(/student-enrollment-template\.xlsx/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    expect(workbook.getWorksheet('Students').getRow(1).values.slice(1)).toEqual(
      expect.arrayContaining(['sapId', 'name', 'email', 'category', 'course', 'department', 'parentEmail', 'hostel'])
    );
    // The hostels registered in MongoDB feed the hostel dropdown.
    expect(workbook.getWorksheet('Lists').getCell('A2').value).toBe('North Hostel');
  });
});

describe('B. File upload checks', () => {
  it('accepts a valid .xlsx', async () => {
    const job = await validated([makeStudent(1)]);
    expect(job.status).toBe('awaiting_confirmation');
    expect(job.totals).toMatchObject({ rows: 1, valid: 1, invalid: 0 });
  });

  it.each([
    ['an empty file', Buffer.alloc(0), 'students.xlsx', 400, 'EMPTY_FILE'],
    ['a CSV', Buffer.from('sapId,name\n1,a'), 'students.csv', 400, 'UNSUPPORTED_TYPE'],
    ['a legacy .xls', Buffer.from('x'), 'students.xls', 400, 'UNSUPPORTED_TYPE'],
    ['a corrupted workbook', Buffer.from('definitely not an excel file'), 'students.xlsx', 400, 'CORRUPT_FILE'],
  ])('rejects %s', async (_label, buffer, name, httpStatus, code) => {
    const res = await uploadFile(buffer, name);
    expect(res.status).toBe(httpStatus);
    expect(res.body.code).toBe(code);
    expect(await BulkEnrollment.countDocuments()).toBe(0);
  });

  it('rejects a request with no file', async () => {
    const res = await request(app).post('/api/students/bulk/validate').set(admin.auth);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_FILE');
  });

  it('rejects a file over the size limit with 413', async () => {
    process.env.BULK_MAX_FILE_MB = '1';
    try {
      const res = await uploadFile(Buffer.alloc(1.5 * 1024 * 1024, 1));
      expect(res.status).toBe(413);
      expect(res.body.code).toBe('FILE_TOO_LARGE');
    } finally {
      delete process.env.BULK_MAX_FILE_MB;
    }
  });

  it('rejects an empty worksheet, a headers-only sheet and missing headers', async () => {
    expect((await uploadFile(await buildXlsx({ headers: [], rows: [] }))).body.code).toBe('EMPTY_SHEET');
    expect((await uploadFile(await buildXlsx({ rows: [] }))).body.code).toBe('NO_ROWS');
    const res = await uploadFile(await buildXlsx({ headers: ['sapId', 'name'], rows: [{ sapId: '1', name: 'x' }] }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_HEADERS');
    expect(res.body.details.missingHeaders).toContain('email');
  });

  it('rejects a file with more students than the row limit', async () => {
    process.env.BULK_MAX_ROWS = '5';
    try {
      const res = await uploadFile(await buildXlsx({ rows: [1, 2, 3, 4, 5, 6].map((i) => makeStudent(i)) }));
      expect(res.status).toBe(413);
      expect(res.body.code).toBe('TOO_MANY_ROWS');
    } finally {
      delete process.env.BULK_MAX_ROWS;
    }
  });
});

describe('Test file 1: all valid (10 unique students)', () => {
  const students = Array.from({ length: 10 }, (_v, i) => makeStudent(i + 1));

  it('saves nothing until the administrator confirms', async () => {
    const job = await validated(students);
    expect(job.totals).toMatchObject({ rows: 10, valid: 10, invalid: 0, duplicateInFile: 0, existing: 0 });
    expect(await Student.countDocuments()).toBe(0);
  });

  it('enrolls all 10 with every field stored correctly', async () => {
    const job = await enroll(students);
    expect(job.status).toBe('completed');
    expect(job.progress).toMatchObject({ total: 10, processed: 10, enrolled: 10, failed: 0, skipped: 0 });
    expect(await Student.countDocuments()).toBe(10);

    const saved = await Student.findOne({ sapId: sapOf(3) }).lean();
    expect(saved).toMatchObject({
      sapId: sapOf(3), name: nameOf(3), email: 'test.student3@example.com', category: 'dayscholars',
      course: 'engineering', department: 'computer science', year: 2, parentEmail: 'parent3@example.com',
      address: '1 Test Street', bloodGroup: 'O+', studentType: 'day_scholar', isHosteller: false,
      wardenApprovalRequired: false, roomNumber: '', isActive: true, accessStatus: 'allowed', fingerprintStatus: 'awaiting',
    });
    expect(saved.hostel).toBeNull();
  });

  it('queues the new students for the gate terminals', async () => {
    await enroll(students);
    expect(hooks.onStudentsImported).toHaveBeenCalledTimes(1);
    const [ids] = hooks.onStudentsImported.mock.calls[0];
    expect(ids).toHaveLength(10);
  });

  it('writes audit logs for the validation and the enrollment', async () => {
    await enroll(students);
    const logs = await AuditLog.find({ entity: 'BulkEnrollment' }).lean();
    expect(logs.map((l) => l.action).join('\n')).toMatch(/Validated bulk enrollment/);
    expect(logs.map((l) => l.action).join('\n')).toMatch(/Bulk enrolled 10 students/);
  });

  it('makes the new students available to the gate lookup API (used by both gate machines)', async () => {
    await enroll(students);
    const guardLookup = await request(app).get(`/api/students/${sapOf(5)}`).set(security.auth);
    expect(guardLookup.status).toBe(200);
    expect(guardLookup.body).toMatchObject({ sapId: sapOf(5), name: nameOf(5), parentEmail: 'parent5@example.com' });
    expect((await request(app).get('/api/students/7100999999').set(security.auth)).status).toBe(404);
  });
});

describe('Test file 2: mixed valid and invalid', () => {
  const rows = [
    makeStudent(1),
    makeStudent(2, { name: '' }),
    makeStudent(3, { email: 'not-an-email' }),
    makeStudent(4, { category: 'visitor' }),
    makeStudent(5, { category: 'hostellers', hostel: '' }),
    makeStudent(6),
    makeStudent(7, { sapId: 'E265007' }),
    makeStudent(8, { parentEmail: 'bad@' }),
    makeStudent(9),
  ];

  it('flags every invalid row with its Excel row number before confirmation', async () => {
    const job = await validated(rows);
    expect(job.totals).toMatchObject({ rows: 9, valid: 3, invalid: 6 });
    const invalid = (await rowsOf(job.id, '?filter=invalid')).body;
    expect(invalid.rows.map((r) => r.rowNumber)).toEqual([3, 4, 5, 6, 8, 9]);
    const messageFor = (n) => invalid.rows.find((r) => r.rowNumber === n).issues.map((i) => i.message).join(' ');
    expect(messageFor(3)).toMatch(/name is required/i);
    expect(messageFor(4)).toMatch(/Invalid email/i);
    expect(messageFor(5)).toMatch(/Invalid category/i);
    expect(messageFor(6)).toMatch(/Hostel is required/i);
    expect(messageFor(8)).toMatch(/SAP ID .* not valid/i);
    expect(messageFor(9)).toMatch(/parent email/i);
    expect(await Student.countDocuments()).toBe(0);
  });

  it('enrolls only the valid rows and reports the rest', async () => {
    const job = await enroll(rows);
    expect(job.status).toBe('completed_with_errors');
    expect(job.progress).toMatchObject({ enrolled: 3, failed: 0 });
    expect(await Student.find().distinct('sapId')).toEqual(expect.arrayContaining([sapOf(1), sapOf(6), sapOf(9)]));
    expect(await Student.countDocuments()).toBe(3);
  });

  it('produces an invalid-rows report with the original row numbers and reasons', async () => {
    const job = await enroll(rows);
    const workbook = await readReport(job.id, 'invalid');
    const sheet = workbook.getWorksheet('invalid');
    expect(sheet.rowCount).toBe(7); // header + 6 invalid rows
    expect(sheet.getRow(2).getCell(1).value).toBe(3);
    const details = String(sheet.getRow(2).getCell(sheet.getRow(1).values.length - 1).value);
    expect(details).toMatch(/name is required/i);
  });

  it('filters and searches the preview', async () => {
    const job = await validated(rows);
    expect((await rowsOf(job.id, '?filter=valid')).body.total).toBe(3);
    expect((await rowsOf(job.id, `?search=${sapOf(6)}`)).body.rows[0].rowNumber).toBe(7);
    expect((await rowsOf(job.id, '?limit=2&page=2')).body.rows).toHaveLength(2);
  });
});

describe('Test file 3: duplicates inside the file', () => {
  const rows = [makeStudent(1), makeStudent(2), makeStudent(1, { name: 'Other Person' }), makeStudent(3), makeStudent(2)];

  it('detects repeated SAP IDs and keeps only the first occurrence', async () => {
    const job = await validated(rows);
    expect(job.totals).toMatchObject({ rows: 5, valid: 3, duplicateInFile: 2 });
    const dup = (await rowsOf(job.id, '?filter=duplicates')).body.rows;
    expect(dup.map((r) => r.rowNumber)).toEqual([4, 6]);
    expect(dup[0].issues[0].message).toMatch(/already appears in row 2/);
  });

  it('enrolls each SAP ID exactly once', async () => {
    const job = await enroll(rows);
    expect(job.progress.enrolled).toBe(3);
    expect(await Student.countDocuments()).toBe(3);
    expect((await Student.findOne({ sapId: sapOf(1) })).name).toBe(nameOf(1)); // the first row wins
  });
});

describe('Test file 4: students already in MongoDB', () => {
  beforeEach(async () => {
    await Student.create(dbStudent(1, { category: 'dayscholars' }));
    await Student.create(dbStudent(2, { name: 'Original Name' }));
  });

  it('marks existing students and never overwrites them', async () => {
    const job = await validated([makeStudent(1), makeStudent(2, { name: 'Changed Name' }), makeStudent(3)]);
    expect(job.totals).toMatchObject({ valid: 1, existing: 2 });
    const existing = (await rowsOf(job.id, '?filter=existing')).body.rows;
    expect(existing.map((r) => r.conflict)).toEqual([false, true]); // row 3 has different data than stored
    expect(existing[1].issues[0].message).toMatch(/NOT overwritten/);

    await confirm(job.id);
    await service.waitForJob(job.id);
    expect((await Student.findOne({ sapId: sapOf(2) })).name).toBe('Original Name');
    expect(await Student.countDocuments()).toBe(3);
  });

  it('a second upload of the same file enrolls nobody and confirming it is refused', async () => {
    await enroll([makeStudent(10), makeStudent(11)]);
    const again = await validated([makeStudent(10), makeStudent(11)]);
    expect(again.totals).toMatchObject({ valid: 0, existing: 2 });
    const res = await confirm(again.id);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOTHING_TO_ENROLL');
    expect(await Student.countDocuments()).toBe(4);
  });
});

describe('Test file 5: large upload (600 students)', () => {
  it('enrolls every record with real batch progress and loses nothing', async () => {
    process.env.BULK_BATCH_SIZE = '50';
    try {
      const rows = Array.from({ length: 600 }, (_v, i) => makeStudent(i + 1));
      const job = await validated(rows);
      expect(job.totals).toMatchObject({ rows: 600, valid: 600 });

      expect((await confirm(job.id)).status).toBe(202);
      const seen = [];
      for (let i = 0; i < 400; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { body } = await status(job.id);
        seen.push(body.progress.processed);
        if (body.status !== 'processing') break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await service.waitForJob(job.id);
      const final = (await status(job.id)).body;

      expect(final.status).toBe('completed');
      expect(final.progress).toMatchObject({ total: 600, processed: 600, enrolled: 600, failed: 0, skipped: 0 });
      expect(await Student.countDocuments()).toBe(600);
      expect(seen).toEqual([...seen].sort((a, b) => a - b)); // progress only ever moves forward
      expect(hooks.onStudentsImported.mock.calls[0][0]).toHaveLength(600);
    } finally {
      delete process.env.BULK_BATCH_SIZE;
    }
  });
});

describe('Test file 6: edge cases', () => {
  it('parses and stores leading zeros, blanks, spaces, long names, optional gaps and both categories', async () => {
    const longName = `${'A'.repeat(99)}b`;
    const buffer = await buildXlsx({
      rows: [
        makeStudent(1, { sapId: '00123456789' }),
        {},
        makeStudent(2, { sapId: 71000000002 }),
        makeStudent(3, { name: `   Asha    Rao  `, sapId: ' 71000000003 ' }),
        makeStudent(4, { name: longName }),
        makeStudent(5, { year: '', phone: '', parentPhone: '', address: '', bloodGroup: '' }),
        makeStudent(6, { category: 'Hosteller', hostel: 'nh', roomNumber: 'B-204' }),
        makeStudent(7, { category: 'Day Scholar' }),
      ],
    });
    const res = await uploadFile(buffer);
    expect(res.status).toBe(201);
    expect(res.body.totals).toMatchObject({ rows: 7, blankRows: 1, valid: 7, invalid: 0 });
    await confirm(res.body.id);
    await service.waitForJob(res.body.id);

    expect((await Student.findOne({ sapId: '00123456789' })).sapId).toBe('00123456789');
    expect(await Student.findOne({ sapId: '71000000002' })).not.toBeNull();
    expect((await Student.findOne({ sapId: '71000000003' })).name).toBe('Asha Rao');
    expect((await Student.findOne({ sapId: sapOf(4) })).name).toHaveLength(100);
    const sparse = await Student.findOne({ sapId: sapOf(5) }).lean();
    expect(sparse.year).toBeUndefined();
    expect(sparse.phone).toBeUndefined();
    const hosteller = await Student.findOne({ sapId: sapOf(6) }).lean();
    expect(hosteller).toMatchObject({ category: 'hostellers', studentType: 'hosteller', isHosteller: true, wardenApprovalRequired: true, roomNumber: 'B-204' });
    expect(String(hosteller.hostel)).toBe(String(hostel._id));
    expect((await Student.findOne({ sapId: sapOf(7) })).category).toBe('dayscholars');
  });

  it('refuses the template sample row', async () => {
    const job = await validated([makeStudent(1, { sapId: '70552600099' })]);
    expect(job.totals.invalid).toBe(1);
  });

  it('keeps the sample-ID guard off real students that merely resemble it', async () => {
    const job = await validated([makeStudent(1, { sapId: '70552600098' })]);
    expect(job.totals.valid).toBe(1);
  });
});

describe('Concurrency and data integrity', () => {
  it('two simultaneous uploads of the same SAP IDs enroll each student exactly once', async () => {
    const rows = Array.from({ length: 30 }, (_v, i) => makeStudent(i + 1));
    const [a, b] = [await validated(rows), await validated(rows)];
    const [ra, rb] = await Promise.all([confirm(a.id), confirm(b.id)]);
    expect([ra.status, rb.status]).toEqual([202, 202]);
    await Promise.all([service.waitForJob(a.id), service.waitForJob(b.id)]);

    expect(await Student.countDocuments()).toBe(30);
    const [ja, jb] = [(await status(a.id)).body, (await status(b.id)).body];
    // Every row is accounted for in both jobs, and together they enrolled exactly 30.
    [ja, jb].forEach((job) => expect(job.progress.enrolled + job.progress.failed + job.progress.skipped).toBe(30));
    expect(ja.progress.enrolled + jb.progress.enrolled).toBe(30);
  });

  it('the database unique index rejects a race the pre-check missed, and it is reported (not lost)', async () => {
    const job = await validated([makeStudent(1), makeStudent(2)]);
    await Student.create(dbStudent(1)); // someone enrolls student 1 after our validation
    // Blind the pre-insert duplicate check once so the insert itself hits the unique index.
    const realFind = Student.find.bind(Student);
    const spy = jest.spyOn(Student, 'find').mockImplementationOnce(() => ({ select: () => ({ lean: async () => [] }) }));
    await confirm(job.id);
    await service.waitForJob(job.id);
    spy.mockRestore();
    Student.find = realFind;

    const final = (await status(job.id)).body;
    expect(final.progress).toMatchObject({ enrolled: 1, failed: 1 });
    expect(final.status).toBe('completed_with_errors');
    const failed = (await rowsOf(job.id, '?filter=failed')).body.rows;
    expect(failed).toHaveLength(1);
    expect(failed[0].sapId).toBe(sapOf(1));
    expect(failed[0].outcomeMessage).toMatch(/already exists/i);
    expect(await Student.countDocuments()).toBe(2);
  });

  it('a student enrolled between validation and confirmation is skipped, not duplicated', async () => {
    const job = await validated([makeStudent(1), makeStudent(2)]);
    await Student.create(dbStudent(2, { name: 'Added Meanwhile' }));
    await confirm(job.id);
    await service.waitForJob(job.id);
    const final = (await status(job.id)).body;
    expect(final.progress).toMatchObject({ enrolled: 1, skipped: 1 });
    expect((await Student.findOne({ sapId: sapOf(2) })).name).toBe('Added Meanwhile');
  });

  it('confirming the same upload twice at once starts only one run', async () => {
    const job = await validated(Array.from({ length: 20 }, (_v, i) => makeStudent(i + 1)));
    const results = await Promise.all([confirm(job.id), confirm(job.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([202, 409]);
    await service.waitForJob(job.id);
    expect(await Student.countDocuments()).toBe(20);
    expect(hooks.onStudentsImported).toHaveBeenCalledTimes(1);
  });

  it('a database failure is never reported as success', async () => {
    const job = await validated([makeStudent(1), makeStudent(2), makeStudent(3)]);
    const spy = jest.spyOn(Student, 'bulkWrite').mockRejectedValue(new Error('connection reset secret-host:27017'));
    await confirm(job.id);
    await service.waitForJob(job.id);
    spy.mockRestore();

    const final = (await status(job.id)).body;
    expect(final.status).toBe('completed_with_errors');
    expect(final.progress).toMatchObject({ enrolled: 0, failed: 3 });
    expect(await Student.countDocuments()).toBe(0);
    const failed = (await rowsOf(job.id, '?filter=failed')).body.rows;
    expect(failed).toHaveLength(3);
    // Internal details must not leak to the browser.
    expect(JSON.stringify(failed)).not.toMatch(/secret-host|27017/);
    expect(hooks.onStudentsImported).not.toHaveBeenCalled();
  });

  it('marks a run that was interrupted by a server restart as failed', async () => {
    const stuck = await BulkEnrollment.create({ admin: admin.admin._id, fileName: 'x.xlsx', fileSize: 1, status: 'processing' });
    await service.recoverInterrupted();
    const reloaded = await BulkEnrollment.findById(stuck._id).lean();
    expect(reloaded.status).toBe('failed');
    expect(reloaded.error).toMatch(/restarted/i);
  });
});

describe('Cancel, status and reports', () => {
  it('discards an unconfirmed upload; it can no longer be confirmed or reported', async () => {
    const job = await validated([makeStudent(1)]);
    const cancelled = await request(app).delete(`/api/students/bulk/${job.id}`).set(admin.auth);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect((await confirm(job.id)).status).toBe(409);
    expect((await request(app).get(`/api/students/bulk/${job.id}/report`).set(admin.auth)).status).toBe(409);
    expect(await Student.countDocuments()).toBe(0);
  });

  it('refuses to cancel a run that already finished', async () => {
    const job = await enroll([makeStudent(1)]);
    expect((await request(app).delete(`/api/students/bulk/${job.id}`).set(admin.auth)).status).toBe(409);
  });

  it('returns 404 for unknown or malformed ids', async () => {
    expect((await status(new mongoose.Types.ObjectId().toString())).status).toBe(404);
    expect((await status('not-an-id')).status).toBe(404);
  });

  it('builds every report type with correct numbers and no formula injection', async () => {
    const rows = [
      makeStudent(1, { address: '=HYPERLINK("http://evil.example","click")' }),
      makeStudent(2, { email: 'bad' }),
      makeStudent(1),
      makeStudent(3),
    ];
    await Student.create(dbStudent(3));
    const job = await enroll(rows);
    expect(job.totals).toMatchObject({ rows: 4, valid: 1, invalid: 1, duplicateInFile: 1, existing: 1 });

    const summary = await readReport(job.id, 'summary');
    const labels = Object.fromEntries(summary.getWorksheet('Summary').getSheetValues().filter(Boolean).map(([, k, v]) => [k, v]));
    expect(labels['Total records in Excel']).toBe(4);
    expect(labels['Successfully enrolled']).toBe(1);
    expect(labels['Invalid records']).toBe(1);

    for (const [type, expectedRows] of [['enrolled', 1], ['invalid', 1], ['duplicates', 1], ['existing', 1], ['failed', 0], ['all', 4]]) {
      // eslint-disable-next-line no-await-in-loop
      const workbook = await readReport(job.id, type);
      expect(workbook.getWorksheet(type).rowCount - 1).toBe(expectedRows);
    }
    const enrolled = (await readReport(job.id, 'enrolled')).getWorksheet('enrolled');
    const addressColumn = enrolled.getRow(1).values.indexOf('address');
    expect(String(enrolled.getRow(2).getCell(addressColumn).value).startsWith("'=HYPERLINK")).toBe(true);
    // An unknown type falls back to the summary instead of failing.
    expect((await request(app).get(`/api/students/bulk/${job.id}/report?type=bogus`).set(admin.auth)).status).toBe(200);
  });
});

describe('End-to-end: the whole administrator workflow, then the gate', () => {
  it('template -> fill -> upload -> preview -> confirm -> database -> report -> gate scan', async () => {
    // 1-3. Log in as administrator and download the template.
    const templateRes = await request(app).get('/api/students/bulk/template').set(admin.auth).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(templateRes.status).toBe(200);

    // 4. Fill the real downloaded template (delete the sample row, add students).
    const filled = new ExcelJS.Workbook();
    await filled.xlsx.load(templateRes.body);
    const sheet = filled.getWorksheet('Students');
    sheet.spliceRows(2, 1);
    [
      makeStudent(1),
      makeStudent(2, { category: 'hostellers', hostel: 'North Hostel', roomNumber: '101' }),
      makeStudent(3, { email: 'broken' }),
      makeStudent(1),
    ].forEach((student, index) => {
      // Write into rows 2..5 (the template is pre-formatted down to row 5001, so addRow would append far below).
      sheet.getRow(index + 2).values = Object.values(student);
    });
    const file = Buffer.from(await filled.xlsx.writeBuffer());

    // 5-8. Upload, wait for parsing, inspect the preview, find the bad and duplicate rows.
    const uploaded = await uploadFile(file, 'march-intake.xlsx');
    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({ fileName: 'march-intake.xlsx', status: 'awaiting_confirmation', totals: { rows: 4, valid: 2, invalid: 1, duplicateInFile: 1 } });
    expect((await rowsOf(uploaded.body.id, '?filter=duplicates')).body.rows[0].rowNumber).toBe(5);
    expect((await rowsOf(uploaded.body.id, '?filter=invalid')).body.rows[0].rowNumber).toBe(4);
    expect(await Student.countDocuments()).toBe(0);

    // 9-10. Confirm and verify the records in MongoDB.
    expect((await confirm(uploaded.body.id)).status).toBe(202);
    await service.waitForJob(uploaded.body.id);
    const final = (await status(uploaded.body.id)).body;
    expect(final).toMatchObject({ status: 'completed_with_errors', phase: 'Completed with errors', progress: { total: 2, processed: 2, enrolled: 2, failed: 0 } });
    expect(await Student.countDocuments()).toBe(2);

    // 11. The final report accounts for every row.
    const all = (await readReport(uploaded.body.id, 'all')).getWorksheet('all');
    expect(all.rowCount - 1).toBe(4);

    // 12. Both gate machines find the new students through the existing lookup, and a gate scan works.
    const lookup = await request(app).get(`/api/students/${sapOf(2)}`).set(security.auth);
    expect(lookup.status).toBe(200);
    expect(lookup.body.hostel).toMatchObject({ name: 'North Hostel' });
    const scan = await request(app).post('/api/scan').set(security.auth).send({ sapId: sapOf(1) });
    expect([200, 201]).toContain(scan.status);
    expect(scan.body).toMatchObject({ authorized: true, action: 'entry' });
  });

  it('keeps manual student registration working', async () => {
    const res = await request(app).post('/api/students').set(admin.auth).send({
      sapId: '72000000001', name: 'Manual Student', email: 'manual@example.com', category: 'dayscholars',
      course: 'engineering', department: 'computer science',
    });
    expect(res.status).toBe(201);
    expect(await Student.findOne({ sapId: '72000000001' })).not.toBeNull();
  });
});
