/**
 * Sidecar bulk loader: first load of many students (and templates) onto a terminal
 * over ZK TCP, which is much faster than push (≈1 command per poll). Throttled,
 * resumable (cursor persisted per batch) and limited to one job per terminal.
 */
const crypto = require('crypto');
const SyncJob = require('../../models/SyncJob');
const Student = require('../../models/Student');
const TerminalConfig = require('../../models/TerminalConfig');
const BiometricTemplate = require('../../models/BiometricTemplate');
const { getSyncConfig } = require('../../config/terminalSync');
const { getSidecar } = require('../sidecar');
const { loadTemplateValue } = require('./templateStore');
const { ensureStudentPin } = require('./pinAllocator');
const { upsertUserState } = require('./commandQueue');
const { withTerminalLock, createLimiter } = require('./terminalLock');
const { recordBiometricAudit } = require('./biometricAudit');
const { emitSyncTerminal } = require('../socketService');

const BATCH_SIZE = 20;
let limiter = null;
const getLimiter = () => {
  if (!limiter) limiter = createLimiter(getSyncConfig().sidecar.concurrency);
  return limiter;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildSidecarUser = async (student) => {
  const pin = await ensureStudentPin(student);
  const metas = await BiometricTemplate.find({ student: student._id, flag: { $ne: 0 } }).select('_id').lean();
  const templates = [];
  for (const meta of metas) {
    const value = await loadTemplateValue(meta._id);
    if (value) templates.push({ fid: value.fingerIndex, valid: value.flag, template: value.value });
  }
  return { user_id: pin, name: String(student.name || '').slice(0, 24), privilege: 0, templates };
};

const runBulkJob = async (jobId) => {
  const sidecar = getSidecar();
  if (!sidecar) throw new Error('Sidecar is not configured');
  const job = await SyncJob.findOne({ jobId });
  if (!job || ['completed', 'failed'].includes(job.status)) return job;
  const terminal = await TerminalConfig.findOne({ deviceSN: job.terminalSN }).lean();
  if (!terminal?.terminalIP) throw new Error(`Terminal ${job.terminalSN} has no IP for the sidecar`);
  const { bulkDelayMs } = getSyncConfig().sidecar;

  return withTerminalLock(job.terminalSN, async () => {
    job.status = 'running';
    job.startedAt = job.startedAt || new Date();
    await job.save();

    while (job.cursor < job.studentIds.length) {
      const batchIds = job.studentIds.slice(job.cursor, job.cursor + BATCH_SIZE);
      const students = await Student.find({ _id: { $in: batchIds }, isActive: true, accessStatus: { $ne: 'blocked' } });
      const users = [];
      for (const student of students) {
        users.push({ student, user: await buildSidecarUser(student) });
      }
      try {
        if (users.length) {
          await sidecar.upsertUsersBatch(terminal.terminalIP, users.map((u) => u.user));
          for (const { student, user } of users) {
            await upsertUserState({ terminalSN: job.terminalSN, pin: user.user_id, student: student._id, present: true, source: 'ack' });
            for (const tpl of user.templates) {
              await upsertUserState({
                terminalSN: job.terminalSN,
                pin: user.user_id,
                student: student._id,
                present: true,
                fingerIndex: tpl.fid,
                source: 'ack',
              });
            }
          }
        }
        job.done += users.length;
      } catch (error) {
        job.failed += batchIds.length;
        if (job.errorMessages.length < 50) job.errorMessages.push(error.message);
        // Stop on terminal-level failures (offline etc.); job stays resumable.
        job.status = 'paused';
        await job.save();
        emitSyncTerminal({ terminalSN: job.terminalSN, event: 'bulk_load_paused', jobId, error: error.message });
        return job;
      }
      job.cursor += batchIds.length;
      await job.save();
      emitSyncTerminal({ terminalSN: job.terminalSN, event: 'bulk_load_progress', jobId, done: job.done, total: job.total });
      if (bulkDelayMs) await sleep(bulkDelayMs);
    }

    job.status = 'completed';
    job.finishedAt = new Date();
    await job.save();
    await TerminalConfig.updateOne({ deviceSN: job.terminalSN }, { $set: { lastSyncAt: new Date() } });
    await recordBiometricAudit({
      actor: job.actor,
      action: 'template_write',
      terminal: job.terminalSN,
      details: { jobId, kind: 'bulk_load', done: job.done, failed: job.failed, total: job.total },
    });
    emitSyncTerminal({ terminalSN: job.terminalSN, event: 'bulk_load_completed', jobId, done: job.done, total: job.total });
    return job;
  });
};

const scheduleJob = (jobId) =>
  getLimiter()(() => runBulkJob(jobId)).catch(async (error) => {
    console.error(`[bulk-load] job ${jobId} failed:`, error.message);
    await SyncJob.updateOne({ jobId, status: { $ne: 'completed' } }, { $set: { status: 'paused' }, $push: { errorMessages: error.message } });
  });

const startBulkLoad = async ({ terminal, studentIds, actor = 'system', run = true }) => {
  const jobId = `bulk-${terminal.deviceSN}-${crypto.randomUUID().slice(0, 8)}`;
  const job = await SyncJob.create({
    jobId,
    kind: 'bulk_load',
    terminalSN: terminal.deviceSN,
    studentIds,
    total: studentIds.length,
    actor: typeof actor === 'string' ? actor : `admin:${actor?._id}`,
  });
  if (run) scheduleJob(jobId);
  return job;
};

/** Resume queued/running/paused jobs after a restart. */
const resumeBulkJobs = async () => {
  const jobs = await SyncJob.find({ kind: 'bulk_load', status: { $in: ['queued', 'running'] } }).select('jobId').lean();
  jobs.forEach((job) => scheduleJob(job.jobId));
  return jobs.length;
};

const resumeJob = async (jobId) => {
  await SyncJob.updateOne({ jobId, status: 'paused' }, { $set: { status: 'queued' } });
  scheduleJob(jobId);
};

module.exports = { startBulkLoad, runBulkJob, resumeBulkJobs, resumeJob, buildSidecarUser };
