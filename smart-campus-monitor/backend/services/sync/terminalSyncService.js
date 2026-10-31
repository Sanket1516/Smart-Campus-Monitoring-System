/**
 * terminalSyncService: keeps every terminal's user list and templates in line with
 * the database.
 *
 *  enqueueProvision(student)      create user (+ stored templates) on target terminals
 *  enqueueDelete(student)         delete user from every terminal that may hold them
 *  enqueueRestore(student)        provision again from stored templates (no recapture)
 *  enqueueForNewTerminal(terminal) load all eligible students onto a terminal
 *  deEnrolAndErase(student)       delete from all terminals AND erase templates in MongoDB
 *
 * All operations are idempotent: repeated calls never create duplicate open commands,
 * "create existing user" is an upsert and "delete missing user" counts as success.
 */
const Student = require('../../models/Student');
const TerminalConfig = require('../../models/TerminalConfig');
const TerminalCommand = require('../../models/TerminalCommand');
const TerminalUserState = require('../../models/TerminalUserState');
const BiometricTemplate = require('../../models/BiometricTemplate');
const DeviceAllocation = require('../../models/DeviceAllocation');
const { getSyncConfig } = require('../../config/terminalSync');
const { enqueueCommand, cancelOpenCommands } = require('./commandQueue');
const { ensureStudentPin } = require('./pinAllocator');
const { deleteTemplatesForStudent } = require('./templateStore');
const { recordBiometricAudit } = require('./biometricAudit');
const {
  desiredTerminalsForStudent,
  isStudentEligible,
  terminalGroups,
  studentGroups,
  intersects,
  isGateTerminal,
} = require('./groups');
const { emitSyncStudent, emitSyncTerminal } = require('../socketService');

const TERMINAL_FIELDS =
  'deviceSN terminalIP terminalLabel gateName machineNumber terminalType hostel isEnrollmentStation role groups enabled dialect isOnline lastSeen status';

const loadTerminals = () => TerminalConfig.find({ enabled: { $ne: false } }).select(TERMINAL_FIELDS).lean();

const loadStudent = async (studentOrId) => {
  const id = studentOrId?._id || studentOrId;
  return Student.findById(id);
};

const templateMetaFor = (studentId) =>
  BiometricTemplate.find({ student: studentId, flag: { $ne: 0 } }).select('fingerIndex flag sha256 pin').sort({ fingerIndex: 1 }).lean();

const userParams = (student, pin) => ({ pin, name: student.name || `USER ${pin}`, privilege: 0, group: 1 });

/**
 * Queue user record (+ templates) for one student on the given terminals.
 */
const queueStudentOnTerminals = async (student, pin, terminals, { includeTemplates = true, jobId = '', excludeTemplateTerminals = [] } = {}) => {
  const templates = includeTemplates ? await templateMetaFor(student._id) : [];
  let queued = 0;
  for (const terminal of terminals) {
    await cancelOpenCommands({ student, types: ['USER_DELETE'], terminalSN: terminal.deviceSN, reason: 'superseded by provision' });
    const created = await enqueueCommand({
      terminal,
      type: 'USER_CREATE',
      student,
      pin,
      params: userParams(student, pin),
      jobId,
    });
    if (created.created) queued += 1;
    if (excludeTemplateTerminals.includes(terminal.deviceSN)) continue;
    for (const template of templates) {
      const result = await enqueueCommand({
        terminal,
        type: 'TEMPLATE_WRITE',
        student,
        pin,
        params: { pin, fingerIndex: template.fingerIndex, flag: template.flag, sha256: template.sha256 },
        templateRef: template._id,
        dedupeSuffix: String(template.fingerIndex),
        jobId,
      });
      if (result.created) queued += 1;
    }
  }
  return { queued, templates: templates.length };
};

const enqueueProvision = async (studentInput, options = {}) => {
  const {
    actor = 'system',
    reason = 'provision',
    terminals: explicitTerminals = null,
    includeTemplates = true,
    prune = !explicitTerminals,
    jobId = '',
    excludeTemplateTerminals = [],
  } = options;
  const student = await loadStudent(studentInput);
  if (!student) return { skipped: true, reason: 'student not found' };
  if (!isStudentEligible(student)) {
    return { skipped: true, reason: student.accessStatus === 'blocked' ? 'student is blocked' : 'student is inactive' };
  }

  const pin = await ensureStudentPin(student);
  const allTerminals = explicitTerminals ? null : await loadTerminals();
  const targets = explicitTerminals || desiredTerminalsForStudent(student, allTerminals);

  const { queued, templates } = await queueStudentOnTerminals(student, pin, targets, {
    includeTemplates,
    jobId,
    excludeTemplateTerminals,
  });

  // Remove the student from gate terminals they no longer belong to (group change).
  let pruned = 0;
  if (prune) {
    const targetSNs = new Set(targets.map((t) => t.deviceSN));
    const presentStates = await TerminalUserState.find({ student: student._id, present: true }).select('terminalSN').lean();
    const openCreates = await TerminalCommand.find({ student: student._id, open: true, type: 'USER_CREATE' }).select('terminalSN').lean();
    const holders = new Set([...presentStates, ...openCreates].map((row) => row.terminalSN));
    const gateSNs = new Set((allTerminals || []).filter(isGateTerminal).map((t) => t.deviceSN));
    for (const sn of holders) {
      if (targetSNs.has(sn) || !gateSNs.has(sn)) continue;
      await cancelOpenCommands({ student, types: ['USER_CREATE', 'TEMPLATE_WRITE'], terminalSN: sn, reason: 'student left terminal group' });
      const result = await enqueueCommand({ terminal: { deviceSN: sn }, type: 'USER_DELETE', student, pin, params: { pin }, jobId });
      if (result.created) pruned += 1;
    }
  }

  await recordBiometricAudit({
    actor,
    action: reason === 'restore' ? 'unblock' : reason === 'resync' ? 'resync' : 'user_create',
    student,
    result: 'queued',
    details: { reason, pin, terminals: targets.map((t) => t.deviceSN), queued, templates, pruned },
  });
  emitSyncStudent({ studentId: String(student._id), pin, reason, queued, terminals: targets.length });
  return { pin, terminals: targets.map((t) => t.deviceSN), queued, templates, pruned };
};

/** Terminals that might hold the student (used when SYNC_DELETE_SCOPE=known). */
const knownHolders = async (student, terminals) => {
  const states = await TerminalUserState.find({ student: student._id, present: true }).select('terminalSN').lean();
  const commands = await TerminalCommand.find({ student: student._id, type: { $in: ['USER_CREATE', 'TEMPLATE_WRITE'] } })
    .select('terminalSN')
    .lean();
  const desired = desiredTerminalsForStudent({ ...student.toObject?.() ?? student, accessStatus: 'allowed' }, terminals);
  const set = new Set([...states, ...commands, ...desired].map((row) => row.terminalSN || row.deviceSN));
  return terminals.filter((t) => set.has(t.deviceSN) || t.isEnrollmentStation || t.role === 'enrollment');
};

const enqueueDelete = async (studentInput, options = {}) => {
  const { actor = 'system', reason = 'block', terminals: explicitTerminals = null, jobId = '' } = options;
  const student = await loadStudent(studentInput);
  if (!student) return { skipped: true, reason: 'student not found' };
  if (!student.zktUserID) return { skipped: true, reason: 'student has no PIN (never provisioned)', queued: 0 };
  const pin = String(student.zktUserID);

  const all = explicitTerminals || (await loadTerminals());
  const { queue } = getSyncConfig();
  const targets = explicitTerminals ? all : queue.deleteScope === 'all' ? all : await knownHolders(student, all);

  const cancelled = await cancelOpenCommands({
    student,
    types: ['USER_CREATE', 'TEMPLATE_WRITE', 'ENROLL_FP'],
    reason: `superseded by ${reason}`,
    ...(explicitTerminals && explicitTerminals.length === 1 ? { terminalSN: explicitTerminals[0].deviceSN } : {}),
  });

  let queued = 0;
  for (const terminal of targets) {
    const result = await enqueueCommand({ terminal, type: 'USER_DELETE', student, pin, params: { pin }, jobId });
    if (result.created) queued += 1;
  }

  await recordBiometricAudit({
    actor,
    action: reason === 'block' ? 'block' : 'user_delete',
    student,
    result: 'queued',
    details: { reason, pin, terminals: targets.length, queued, cancelled },
  });
  emitSyncStudent({ studentId: String(student._id), pin, reason, queued, terminals: targets.length });
  return { pin, terminals: targets.map((t) => t.deviceSN), queued, cancelled };
};

const enqueueRestore = (student, options = {}) => enqueueProvision(student, { ...options, reason: 'restore' });

/** Bulk helper used by Excel import and bulk block/unblock. Sequential to bound DB load. */
const forEachStudent = async (studentIds, fn) => {
  const results = { ok: 0, skipped: 0, failed: 0, errors: [] };
  for (const id of studentIds) {
    try {
      const result = await fn(id);
      if (result?.skipped) results.skipped += 1;
      else results.ok += 1;
    } catch (error) {
      results.failed += 1;
      if (results.errors.length < 20) results.errors.push({ student: String(id), error: error.message });
    }
  }
  return results;
};

const enqueueProvisionMany = (studentIds, options) => forEachStudent(studentIds, (id) => enqueueProvision(id, options));
const enqueueDeleteMany = (studentIds, options) => forEachStudent(studentIds, (id) => enqueueDelete(id, options));
const enqueueRestoreMany = (studentIds, options) => forEachStudent(studentIds, (id) => enqueueRestore(id, options));

/** Students that belong on a terminal (by group). */
const studentsForTerminal = async (terminal) => {
  const groups = terminalGroups(terminal);
  const candidates = await Student.find({ isActive: true, accessStatus: { $ne: 'blocked' } })
    .select('name zktUserID targetTerminalGroups studentType isHosteller category hostel isActive accessStatus fingerprintStatus')
    .lean();
  return candidates.filter((student) => intersects(studentGroups(student), groups));
};

/**
 * Load every eligible student onto a (new) terminal. Small sets go through the push
 * queue; large sets use the sidecar bulk loader when one is configured.
 */
const enqueueForNewTerminal = async (terminalInput, options = {}) => {
  const { actor = 'system', mode = 'auto' } = options;
  const terminal = terminalInput.deviceSN
    ? terminalInput
    : await TerminalConfig.findById(terminalInput).lean();
  if (!terminal) return { skipped: true, reason: 'terminal not found' };
  if (!isGateTerminal(terminal)) return { skipped: true, reason: 'not an enabled gate terminal' };

  const students = await studentsForTerminal(terminal);
  const { sidecar } = getSyncConfig();
  const { getSidecar } = require('../sidecar');
  const useSidecar =
    mode === 'sidecar' || (mode === 'auto' && getSidecar() && terminal.terminalIP && students.length > sidecar.bulkThreshold);

  if (useSidecar) {
    const { startBulkLoad } = require('./bulkLoader');
    const job = await startBulkLoad({ terminal, studentIds: students.map((s) => s._id), actor });
    emitSyncTerminal({ terminalSN: terminal.deviceSN, event: 'bulk_load_started', jobId: job.jobId, students: students.length });
    return { mode: 'sidecar', jobId: job.jobId, students: students.length };
  }

  const jobId = `newterm-${terminal.deviceSN}-${Date.now()}`;
  let queued = 0;
  for (const student of students) {
    const doc = await Student.findById(student._id);
    const pin = await ensureStudentPin(doc);
    const result = await queueStudentOnTerminals(doc, pin, [terminal], { jobId });
    queued += result.queued;
  }
  await recordBiometricAudit({
    actor,
    action: 'resync',
    terminal: terminal.deviceSN,
    result: 'queued',
    details: { reason: 'new_terminal', students: students.length, queued, jobId },
  });
  emitSyncTerminal({ terminalSN: terminal.deviceSN, event: 'provision_queued', jobId, students: students.length, queued });
  return { mode: 'push', jobId, students: students.length, queued };
};

/**
 * Called after a template is stored (enrolment). Marks the student enrolled and fans
 * the template out to their target terminals.
 */
const onTemplateStored = async (studentInput, { sourceTerminal = '', actor = 'system' } = {}) => {
  const student = await loadStudent(studentInput);
  if (!student) return { skipped: true };
  const now = new Date();
  await Student.updateOne(
    { _id: student._id },
    { $set: { fingerprintStatus: 'enrolled', fingerprintEnrolled: true, fingerprintEnrolledAt: now } }
  );
  emitSyncStudent({ studentId: String(student._id), event: 'enrolled', sourceTerminal });
  if (!isStudentEligible(student)) return { skipped: true, reason: 'student blocked or inactive; template stored only' };
  return enqueueProvision(student, { actor, reason: 'enrolment_fanout' });
};

/**
 * De-enrol and erase (student leaves, or consent withdrawn): delete from every terminal
 * and erase all templates from MongoDB (DPDP s.8(7)).
 */
const deEnrolAndErase = async (studentInput, { actor = 'system', reason = 'erasure' } = {}) => {
  const student = await loadStudent(studentInput);
  if (!student) return { skipped: true, reason: 'student not found' };
  const deletion = await enqueueDelete(student, { actor, reason });
  const erased = await deleteTemplatesForStudent(student, actor);
  await Student.updateOne(
    { _id: student._id },
    {
      $set: {
        fingerprintStatus: 'none',
        fingerprintEnrolled: false,
        fingerprintEnrolledAt: null,
        biometricErasedAt: new Date(),
      },
      $unset: { fingerprintTemplate: 1 },
    }
  );
  await DeviceAllocation.deleteMany({ studentId: student._id });
  await recordBiometricAudit({
    actor,
    action: 'erase',
    student,
    details: { reason, templatesErased: erased, terminalDeletesQueued: deletion.queued || 0 },
  });
  emitSyncStudent({ studentId: String(student._id), event: 'erased' });
  return { templatesErased: erased, terminalDeletes: deletion };
};

/** Per-terminal sync view for one student (UI drawer). */
const getStudentSyncStatus = async (studentId) => {
  const student = await Student.findById(studentId).lean();
  if (!student) return null;
  const terminals = await loadTerminals();
  const desired = new Set(desiredTerminalsForStudent(student, terminals).map((t) => t.deviceSN));
  const states = await TerminalUserState.find({ student: studentId }).lean();
  const commands = await TerminalCommand.find({ student: studentId, status: { $in: ['pending', 'sent', 'failed'] } })
    .select('terminalSN type status attempts lastError returnCode cmdId updatedAt')
    .lean();
  const templates = await BiometricTemplate.find({ student: studentId }).select('fingerIndex flag sha256 sizeBytes createdAt updatedAt sourceTerminal').lean();

  const rows = terminals.map((terminal) => {
    const state = states.find((s) => s.terminalSN === terminal.deviceSN);
    const open = commands.filter((c) => c.terminalSN === terminal.deviceSN);
    const failed = open.filter((c) => c.status === 'failed');
    const pending = open.filter((c) => c.status !== 'failed');
    let status = 'absent';
    if (failed.length) status = 'failed';
    else if (pending.length) status = 'pending';
    else if (state?.present) status = 'present';
    return {
      terminalSN: terminal.deviceSN,
      terminalLabel: terminal.terminalLabel,
      groups: terminalGroups(terminal),
      desired: desired.has(terminal.deviceSN),
      status,
      present: Boolean(state?.present),
      fingers: state?.fingers || [],
      lastConfirmedAt: state?.lastConfirmedAt || null,
      source: state?.source || null,
      commands: open,
      online: Boolean(terminal.isOnline),
    };
  });

  return {
    student: {
      _id: student._id,
      name: student.name,
      sapId: student.sapId,
      pin: student.zktUserID ? String(student.zktUserID) : null,
      fingerprintStatus: student.fingerprintStatus,
      accessStatus: student.accessStatus,
      targetTerminalGroups: studentGroups(student),
    },
    templates: templates.map((t) => ({
      fingerIndex: t.fingerIndex,
      flag: t.flag,
      sha256Prefix: String(t.sha256).slice(0, 12),
      sizeBytes: t.sizeBytes,
      sourceTerminal: t.sourceTerminal,
      updatedAt: t.updatedAt,
    })),
    terminals: rows,
  };
};

module.exports = {
  enqueueProvision,
  enqueueDelete,
  enqueueRestore,
  enqueueProvisionMany,
  enqueueDeleteMany,
  enqueueRestoreMany,
  enqueueForNewTerminal,
  onTemplateStored,
  deEnrolAndErase,
  getStudentSyncStatus,
  studentsForTerminal,
  queueStudentOnTerminals,
  loadTerminals,
};
