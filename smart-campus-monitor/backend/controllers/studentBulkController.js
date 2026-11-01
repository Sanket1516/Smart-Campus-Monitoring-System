const mongoose = require('mongoose');
const multer = require('multer');
const BulkEnrollment = require('../models/BulkEnrollment');
const Hostel = require('../models/Hostel');
const { createAuditLog } = require('../services/auditService');
const { buildTemplate } = require('../services/bulkEnrollment/template');
const { buildReport, REPORT_TYPES } = require('../services/bulkEnrollment/report');
const { getBulkConfig } = require('../services/bulkEnrollment/config');
const { validateUpload, confirmEnrollment, BulkEnrollmentError } = require('../services/bulkEnrollment');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Memory storage: the workbook is parsed and discarded, nothing is written to disk.
const uploadMiddleware = (req, res, next) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: getBulkConfig().maxFileBytes, files: 1 },
  }).single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: `The file is larger than ${Math.round(getBulkConfig().maxFileBytes / (1024 * 1024))} MB.`, code: 'FILE_TOO_LARGE' });
    }
    return res.status(400).json({ message: 'The upload could not be read.', code: 'UPLOAD_ERROR' });
  });

const sendWorkbook = async (res, workbook, filename) => {
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(Buffer.from(buffer));
};

const jobSummary = (job) => ({
  id: job._id,
  fileName: job.fileName,
  fileSize: job.fileSize,
  status: job.status,
  phase: job.phase,
  totals: job.totals,
  unknownColumns: job.unknownColumns,
  progress: job.progress,
  error: job.error || '',
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  createdAt: job.createdAt,
});

const loadJob = async (req, res, { withRows = false } = {}) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: 'Bulk enrollment not found' });
    return null;
  }
  const query = BulkEnrollment.findById(req.params.id);
  const job = await (withRows ? query : query.select('-rows'));
  if (!job) {
    res.status(404).json({ message: 'Bulk enrollment not found' });
    return null;
  }
  return job;
};

const fail = (res, error, fallback) => {
  if (error instanceof BulkEnrollmentError) {
    return res.status(error.status).json({ message: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) });
  }
  console.error(`${fallback}:`, error.message);
  return res.status(500).json({ message: fallback });
};

// GET /api/students/bulk/template
exports.downloadTemplate = async (req, res) => {
  try {
    const hostels = await Hostel.find().select('name code').sort({ name: 1 }).lean();
    const workbook = await buildTemplate({ hostels });
    await sendWorkbook(res, workbook, 'student-enrollment-template.xlsx');
  } catch (error) {
    fail(res, error, 'Could not generate the template');
  }
};

// POST /api/students/bulk/validate  (multipart, field "file")
exports.validate = [
  uploadMiddleware,
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded', code: 'NO_FILE' });
    try {
      const job = await validateUpload({ file: req.file, admin: req.admin, ip: req.ip });
      return res.status(201).json(jobSummary(job));
    } catch (error) {
      return fail(res, error, 'The file could not be validated');
    }
  },
];

// GET /api/students/bulk/:id
exports.getStatus = async (req, res) => {
  try {
    const job = await loadJob(req, res);
    if (job) res.json(jobSummary(job));
  } catch (error) {
    fail(res, error, 'Could not load the enrollment');
  }
};

const ROW_FILTERS = {
  valid: (row) => row.status === 'valid',
  new: (row) => row.status === 'valid',
  invalid: (row) => row.status === 'invalid',
  duplicates: (row) => row.status === 'duplicate_in_file',
  existing: (row) => row.status === 'existing',
  enrolled: (row) => row.outcome === 'enrolled',
  failed: (row) => row.outcome === 'failed',
  skipped: (row) => row.outcome === 'skipped',
};

// GET /api/students/bulk/:id/rows?filter=&search=&page=&limit=
exports.getRows = async (req, res) => {
  try {
    const job = await loadJob(req, res, { withRows: true });
    if (!job) return;
    const filter = ROW_FILTERS[req.query.filter] || (() => true);
    const search = String(req.query.search || '').trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);

    const matching = job.rows.filter((row) => {
      if (!filter(row)) return false;
      if (!search) return true;
      return [row.raw?.sapId, row.raw?.name, row.raw?.email].some((value) => String(value || '').toLowerCase().includes(search));
    });
    const rows = matching.slice((page - 1) * limit, page * limit).map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      outcome: row.outcome || '',
      outcomeMessage: row.outcomeMessage || '',
      issues: row.issues,
      conflict: Boolean(row.conflict),
      sapId: row.raw?.sapId || '',
      name: row.raw?.name || '',
      email: row.raw?.email || '',
      category: row.raw?.category || '',
      course: row.raw?.course || '',
      department: row.raw?.department || '',
    }));
    res.json({ rows, total: matching.length, page, pages: Math.ceil(matching.length / limit) });
  } catch (error) {
    fail(res, error, 'Could not load the rows');
  }
};

// POST /api/students/bulk/:id/confirm
exports.confirm = async (req, res) => {
  try {
    const existing = await loadJob(req, res);
    if (!existing) return;
    if (existing.status !== 'awaiting_confirmation') {
      return res.status(409).json({ message: `This upload is already ${existing.status.replace(/_/g, ' ')} and cannot be confirmed again.`, code: 'NOT_CONFIRMABLE', status: existing.status });
    }
    if (existing.totals.valid === 0) {
      return res.status(400).json({ message: 'There are no valid new students to enroll in this file.', code: 'NOTHING_TO_ENROLL' });
    }
    const job = await confirmEnrollment({ jobId: existing._id, admin: req.admin, ip: req.ip });
    if (!job) return res.status(409).json({ message: 'This upload was already confirmed.', code: 'NOT_CONFIRMABLE' });
    return res.status(202).json(jobSummary(job));
  } catch (error) {
    return fail(res, error, 'Could not start the enrollment');
  }
};

// DELETE /api/students/bulk/:id   (discard an upload that has not been confirmed)
exports.cancel = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Bulk enrollment not found' });
    const job = await BulkEnrollment.findOneAndUpdate(
      { _id: req.params.id, status: 'awaiting_confirmation' },
      { $set: { status: 'cancelled', phase: 'Cancelled', rows: [], finishedAt: new Date() } },
      { new: true }
    ).select('-rows');
    if (!job) return res.status(409).json({ message: 'Only an upload that is awaiting confirmation can be cancelled.', code: 'NOT_CANCELLABLE' });
    await createAuditLog({ admin: req.admin, action: `Cancelled bulk enrollment "${job.fileName}"`, entity: 'BulkEnrollment', entityId: job._id, ipAddress: req.ip }).catch(() => {});
    return res.json(jobSummary(job));
  } catch (error) {
    return fail(res, error, 'Could not cancel the enrollment');
  }
};

// GET /api/students/bulk/:id/report?type=summary|enrolled|failed|invalid|duplicates|existing|skipped|all
exports.report = async (req, res) => {
  try {
    const job = await loadJob(req, res, { withRows: true });
    if (!job) return;
    if (job.status === 'cancelled') return res.status(409).json({ message: 'This upload was cancelled; there is no report.' });
    const type = REPORT_TYPES.includes(req.query.type) ? req.query.type : 'summary';
    const { workbook, kind } = await buildReport(job, type);
    await sendWorkbook(res, workbook, `bulk-enrollment-${kind}-${job._id}.xlsx`);
  } catch (error) {
    fail(res, error, 'Could not generate the report');
  }
};
