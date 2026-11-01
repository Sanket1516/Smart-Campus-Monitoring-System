const crypto = require('crypto');
const Student = require('../../models/Student');
const Hostel = require('../../models/Hostel');
const BulkEnrollment = require('../../models/BulkEnrollment');
const { createAuditLog } = require('../auditService');
const syncHooks = require('../sync/hooks');
const { parseWorkbook, BulkEnrollmentError } = require('./parser');
const { validateStudentRow } = require('./validator');
const { getBulkConfig } = require('./config');

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const loadHostelMap = async () => {
  const hostels = await Hostel.find().select('name code').lean();
  const map = new Map();
  hostels.forEach((hostel) => {
    if (hostel.name) map.set(String(hostel.name).trim().toLowerCase(), hostel);
    if (hostel.code) map.set(String(hostel.code).trim().toLowerCase(), hostel);
  });
  return { map, hostels };
};

const countStatuses = (rows) => {
  const totals = { valid: 0, invalid: 0, duplicateInFile: 0, existing: 0, warnings: 0 };
  rows.forEach((row) => {
    if (row.status === 'valid') totals.valid += 1;
    else if (row.status === 'invalid') totals.invalid += 1;
    else if (row.status === 'duplicate_in_file') totals.duplicateInFile += 1;
    else if (row.status === 'existing') totals.existing += 1;
    if (row.issues.some((issue) => issue.severity === 'warning')) totals.warnings += 1;
  });
  return totals;
};

/**
 * Stage 1-3: parse the workbook, validate every row, detect duplicates (inside the file and against MongoDB).
 * Nothing is written to the Student collection here; the result is stored as a pending BulkEnrollment.
 */
const validateUpload = async ({ file, admin, ip }) => {
  const parsed = await parseWorkbook({ buffer: file.buffer, originalname: file.originalname });
  const { map: hostelMap } = await loadHostelMap();

  const firstRowBySapId = new Map();
  const rows = parsed.rows.map(({ rowNumber, values }) => {
    const { data, issues } = validateStudentRow(values, { hostels: hostelMap });
    const row = { rowNumber, raw: values, status: 'invalid', issues, data: undefined };
    if (issues.some((issue) => issue.severity === 'error')) return row;

    if (firstRowBySapId.has(data.sapId)) {
      row.status = 'duplicate_in_file';
      row.issues.push({ severity: 'error', field: 'sapId', message: `SAP ID ${data.sapId} already appears in row ${firstRowBySapId.get(data.sapId)} of this file` });
      return row;
    }
    firstRowBySapId.set(data.sapId, rowNumber);
    row.status = 'valid';
    row.data = data;
    return row;
  });

  // Duplicates against MongoDB (checked again at enrolment time, because the database can change in between).
  const candidates = rows.filter((row) => row.status === 'valid');
  const existing = new Map();
  for (const ids of chunk(candidates.map((row) => row.data.sapId), 1000)) {
    // eslint-disable-next-line no-await-in-loop
    const found = await Student.find({ sapId: { $in: ids } }).select('sapId name email').lean();
    found.forEach((student) => existing.set(student.sapId, student));
  }
  candidates.forEach((row) => {
    const match = existing.get(row.data.sapId);
    if (!match) return;
    row.status = 'existing';
    const differs = [];
    if (String(match.name || '').trim().toLowerCase() !== row.data.name.toLowerCase()) differs.push(`name "${match.name}"`);
    if (String(match.email || '').trim().toLowerCase() !== row.data.email) differs.push(`email "${match.email}"`);
    row.issues.push({
      severity: 'error',
      field: 'sapId',
      message: differs.length
        ? `SAP ID already enrolled with a different ${differs.join(' and ')}. The existing record is NOT overwritten`
        : 'SAP ID is already enrolled. The existing record is NOT overwritten',
    });
    row.conflict = differs.length > 0;
    row.data = undefined;
  });

  const totals = { rows: rows.length, blankRows: parsed.blankRows, ...countStatuses(rows) };
  const job = await BulkEnrollment.create({
    admin: admin._id,
    fileName: String(file.originalname).slice(0, 200),
    fileSize: file.size ?? file.buffer.length,
    fileHash: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    status: 'awaiting_confirmation',
    phase: 'Awaiting confirmation',
    totals,
    unknownColumns: parsed.unknownColumns,
    progress: { total: totals.valid, processed: 0, enrolled: 0, failed: 0, skipped: 0 },
    rows,
  });

  await createAuditLog({
    admin,
    action: `Validated bulk enrollment file "${job.fileName}" (${totals.valid} ready, ${totals.invalid} invalid, ${totals.duplicateInFile} duplicate in file, ${totals.existing} already enrolled)`,
    entity: 'BulkEnrollment',
    entityId: job._id,
    newValue: { totals },
    ipAddress: ip,
  }).catch((error) => console.error('Bulk audit log failed:', error.message));

  return job;
};

const safeWriteError = (error) => {
  if (error?.code === 11000) return 'SAP ID already exists (it was enrolled by another request moments ago)';
  return 'The database rejected this record';
};

/** Inserts one batch with an unordered bulkWrite and reports exactly which rows were saved. */
const insertBatch = async (batch) => {
  const failed = new Map(); // index in batch -> message
  const ops = batch.map((row) => ({ insertOne: { document: row.data } }));
  try {
    await Student.bulkWrite(ops, { ordered: false });
  } catch (error) {
    const writeErrors = [].concat(error?.writeErrors || error?.result?.getWriteErrors?.() || []);
    if (!writeErrors.length) {
      console.error('Bulk enrollment batch failed:', error.message);
      batch.forEach((_row, index) => failed.set(index, 'The batch could not be saved (database error)'));
      return failed;
    }
    writeErrors.forEach((writeError) => {
      const index = writeError.index ?? writeError.err?.index;
      console.error(`Bulk enrollment row rejected (code ${writeError.code ?? writeError.err?.code}):`, writeError.errmsg || writeError.err?.errmsg);
      failed.set(index, safeWriteError({ code: writeError.code ?? writeError.err?.code }));
    });
  }
  // The database is the source of truth: anything neither rejected nor present was dropped by schema validation.
  const missing = [];
  const present = new Set(
    (await Student.find({ sapId: { $in: batch.map((row) => row.data.sapId) } }).select('sapId').lean()).map((s) => s.sapId)
  );
  batch.forEach((row, index) => {
    if (!failed.has(index) && !present.has(row.data.sapId)) missing.push(index);
  });
  missing.forEach((index) => failed.set(index, 'The record failed schema validation and was not saved'));
  return failed;
};

const running = new Map();

const processJob = async (jobId, admin, ip) => {
  const { batchSize } = getBulkConfig();
  const job = await BulkEnrollment.findById(jobId);
  const toEnroll = job.rows.filter((row) => row.status === 'valid');
  const enrolledSapIds = [];
  const progress = { total: toEnroll.length, processed: 0, enrolled: 0, failed: 0, skipped: 0 };

  try {
    for (const batch of chunk(toEnroll, batchSize)) {
      // Re-check duplicates right before inserting: another admin or request may have enrolled them meanwhile.
      // eslint-disable-next-line no-await-in-loop
      const taken = new Set((await Student.find({ sapId: { $in: batch.map((row) => row.data.sapId) } }).select('sapId').lean()).map((s) => s.sapId));
      const insertable = [];
      batch.forEach((row) => {
        if (taken.has(row.data.sapId)) {
          row.outcome = 'skipped';
          row.outcomeMessage = 'SAP ID was enrolled by another request before this one ran';
          progress.skipped += 1;
        } else insertable.push(row);
      });

      if (insertable.length) {
        // eslint-disable-next-line no-await-in-loop
        const failed = await insertBatch(insertable);
        insertable.forEach((row, index) => {
          if (failed.has(index)) {
            row.outcome = 'failed';
            row.outcomeMessage = failed.get(index);
            progress.failed += 1;
          } else {
            row.outcome = 'enrolled';
            progress.enrolled += 1;
            enrolledSapIds.push(row.data.sapId);
          }
        });
      }
      progress.processed += batch.length;
      // eslint-disable-next-line no-await-in-loop
      await BulkEnrollment.updateOne({ _id: jobId }, { $set: { progress, phase: `Enrolling students (${progress.processed}/${progress.total})` } });
    }

    // Queue the new students for the gate terminals (background, same hook the old import used).
    let terminalSync = null;
    if (enrolledSapIds.length) {
      const ids = [];
      for (const sapIds of chunk(enrolledSapIds, 1000)) {
        // eslint-disable-next-line no-await-in-loop
        ids.push(...(await Student.find({ sapId: { $in: sapIds } }).distinct('_id')));
      }
      terminalSync = syncHooks.onStudentsImported(ids, admin);
    }

    const failedCount = progress.failed;
    const status = failedCount > 0 || job.totals.invalid + job.totals.duplicateInFile > 0 ? 'completed_with_errors' : 'completed';
    await BulkEnrollment.updateOne(
      { _id: jobId },
      {
        $set: {
          rows: job.rows,
          progress,
          status,
          phase: status === 'completed' ? 'Enrollment completed' : 'Completed with errors',
          finishedAt: new Date(),
        },
      }
    );
    await createAuditLog({
      admin,
      action: `Bulk enrolled ${progress.enrolled} students from "${job.fileName}" (${progress.failed} failed, ${progress.skipped} skipped)`,
      entity: 'BulkEnrollment',
      entityId: jobId,
      newValue: { progress, terminalSync: terminalSync ? 'queued' : 'none' },
      ipAddress: ip,
    }).catch((error) => console.error('Bulk audit log failed:', error.message));
  } catch (error) {
    console.error('Bulk enrollment failed:', error.message);
    toEnroll.forEach((row) => {
      if (!row.outcome) {
        row.outcome = 'failed';
        row.outcomeMessage = 'Not processed because the enrollment was interrupted';
        progress.failed += 1;
      }
    });
    await BulkEnrollment.updateOne(
      { _id: jobId },
      { $set: { rows: job.rows, progress, status: 'failed', phase: 'Enrollment failed', error: 'Enrollment was interrupted. Students already saved are kept; re-upload the file and the existing ones are skipped.', finishedAt: new Date() } }
    );
  }
};

/** Stage 4: the administrator confirmed. Starts the background run and returns immediately. */
const confirmEnrollment = async ({ jobId, admin, ip }) => {
  const job = await BulkEnrollment.findOneAndUpdate(
    { _id: jobId, status: 'awaiting_confirmation' },
    { $set: { status: 'processing', phase: 'Starting enrollment', startedAt: new Date() } },
    { new: true }
  );
  if (!job) return null; // unknown id, already confirmed, cancelled or finished
  const run = processJob(job._id, admin, ip).finally(() => running.delete(String(job._id)));
  running.set(String(job._id), run);
  return job;
};

/** Test helper / graceful shutdown: resolves when the run for this job has finished. */
const waitForJob = (jobId) => running.get(String(jobId)) || Promise.resolve();

/** Call once after MongoDB connects: a restart cannot resume a run, so mark it failed and explain. */
const recoverInterrupted = async () => {
  const result = await BulkEnrollment.updateMany(
    { status: 'processing' },
    { $set: { status: 'failed', phase: 'Enrollment interrupted', error: 'The server restarted during enrollment. Students already saved are kept; upload the file again and existing students are skipped.', finishedAt: new Date() } }
  );
  if (result.modifiedCount) console.warn(`Bulk enrollment: ${result.modifiedCount} interrupted run(s) marked failed`);
};

module.exports = { validateUpload, confirmEnrollment, waitForJob, recoverInterrupted, loadHostelMap, BulkEnrollmentError };
