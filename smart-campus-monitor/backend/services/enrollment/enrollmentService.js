/**
 * Pluggable fingerprint enrolment.
 *
 *  menu        (default) the person enrols on the enrollment terminal's own menu under
 *              their PIN; the template then arrives via push (OPERLOG/FINGERTMP/BIODATA)
 *              or is read by the sidecar (fetchEnrollmentTemplate).
 *  pyzk_remote sidecar calls pyzk enroll_user (UNVERIFIED: fails on some ZK8 units).
 *  push_remote ENROLL_FP command over push (UNVERIFIED). Disabled unless enabled.
 */
const Student = require('../../models/Student');
const TerminalConfig = require('../../models/TerminalConfig');
const { getSyncConfig } = require('../../config/terminalSync');
const { enqueueCommand } = require('../sync/commandQueue');
const { ensureStudentPin } = require('../sync/pinAllocator');
const { storeTemplate } = require('../sync/templateStore');
const { hasActiveConsent } = require('../sync/consentService');
const { recordBiometricAudit } = require('../sync/biometricAudit');
const { normalize, isEnrollmentTerminal } = require('../sync/groups');
const { getSidecar } = require('../sidecar');

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

/** The ADMIN_ENROLLMENT terminal (Device 1). Enrolment is only allowed there. */
const resolveEnrollmentTerminal = async (terminalSN) => {
  const filter = terminalSN
    ? { deviceSN: terminalSN }
    : { $or: [{ deviceRole: 'ADMIN_ENROLLMENT' }, { isEnrollmentStation: true }], enabled: { $ne: false } };
  const terminal = await TerminalConfig.findOne(filter).sort({ machineNumber: 1 }).lean();
  if (!terminal) throw httpError(400, 'No enabled ADMIN_ENROLLMENT terminal is registered');
  if (!isEnrollmentTerminal(terminal)) {
    throw httpError(400, `Terminal ${terminal.deviceSN} is not the ADMIN_ENROLLMENT terminal; enrol on Device 1 only`);
  }
  if (terminal.simulated && !getSyncConfig().simulationMode) {
    throw httpError(400, `Terminal ${terminal.deviceSN} is SIMULATED and SIMULATION_MODE is off`);
  }
  return terminal;
};

const setEnrollmentState = (studentId, state, error = '') =>
  Student.updateOne({ _id: studentId }, { $set: { enrollmentState: state, enrollmentError: error } });

/** Mark enrolment sessions that waited longer than ENROLL_TIMEOUT_MIN as timed out. */
const expireEnrollments = async (now = new Date()) => {
  const minutes = getSyncConfig().enrollment.timeoutMinutes;
  const cutoff = new Date(now.getTime() - minutes * 60 * 1000);
  const expired = await Student.find({ enrollmentState: 'waiting_capture', enrollmentStartedAt: { $lte: cutoff } })
    .select('_id enrollmentTerminalSN')
    .lean();
  for (const student of expired) {
    await setEnrollmentState(student._id, 'timeout', `No fingerprint was received within ${minutes} minutes. Retry the enrolment.`);
    await recordBiometricAudit({ actor: 'system', action: 'enroll_start', student: student._id, terminal: student.enrollmentTerminalSN, result: 'timeout' });
  }
  return expired.length;
};

const methodAvailable = (method) => {
  const { enrollment } = getSyncConfig();
  if (method === 'menu') return { ok: true };
  if (method === 'pyzk_remote') {
    if (!enrollment.pyzkRemoteEnabled) return { ok: false, reason: 'pyzk_remote is disabled (ENROLL_PYZK_REMOTE_ENABLED)' };
    if (!getSidecar()) return { ok: false, reason: 'pyzk_remote needs the sidecar (SIDECAR_URL)' };
    return { ok: true };
  }
  if (method === 'push_remote') {
    if (!enrollment.pushRemoteEnabled) return { ok: false, reason: 'push_remote is disabled (ENROLL_PUSH_REMOTE_ENABLED)' };
    return { ok: true };
  }
  return { ok: false, reason: `Unknown enrolment method ${method}` };
};

const listEnrollmentMethods = () =>
  ['menu', 'pyzk_remote', 'push_remote'].map((method) => ({ method, ...methodAvailable(method) }));

const startEnrollment = async (studentId, {
  method,
  targetGroups,
  fingerIndex,
  terminalSN,
  actor = 'system',
} = {}) => {
  const { enrollment } = getSyncConfig();
  const chosen = method || enrollment.defaultMethod;
  const availability = methodAvailable(chosen);
  if (!availability.ok) throw httpError(400, availability.reason);

  const student = await Student.findOne({ _id: studentId, isActive: true });
  if (!student) throw httpError(404, 'Student not found');
  if (student.accessStatus === 'blocked') throw httpError(409, 'Student is blocked; unblock before enrolment');
  if (enrollment.requireConsent && !(await hasActiveConsent(student))) {
    throw httpError(409, 'No biometric consent is recorded for this student (parental consent for under-18s)');
  }

  const finger = Number.isInteger(Number(fingerIndex)) ? Number(fingerIndex) : enrollment.defaultFingerIndex;
  if (finger < 0 || finger > 9) throw httpError(400, 'Finger index must be 0-9');

  const terminal = await resolveEnrollmentTerminal(terminalSN);
  const pin = await ensureStudentPin(student);

  const update = {
    fingerprintStatus: student.fingerprintStatus === 'enrolled' ? 'enrolled' : 'awaiting',
    enrollmentMethod: chosen,
    enrollmentStartedAt: new Date(),
    enrollmentState: 'waiting_capture',
    enrollmentError: '',
    enrollmentTerminalSN: terminal.deviceSN,
  };
  if (Array.isArray(targetGroups) && targetGroups.length) update.targetTerminalGroups = normalize(targetGroups);
  // Re-enrolment keeps the current template (and gate access) until a new one is captured.
  await Student.updateOne({ _id: student._id }, { $set: update });

  const params = { pin, name: student.name, privilege: 0, group: 1 };
  const steps = [];

  if (chosen === 'menu' || chosen === 'push_remote') {
    const created = await enqueueCommand({ terminal, type: 'USER_CREATE', student, pin, params });
    steps.push({ step: 'user_create_on_enrollment_terminal', cmdId: created.command.cmdId });
  }
  if (chosen === 'push_remote') {
    const enrol = await enqueueCommand({
      terminal,
      type: 'ENROLL_FP',
      student,
      pin,
      params: { pin, fingerIndex: finger },
      dedupeSuffix: String(finger),
    });
    steps.push({ step: 'enroll_fp_command', cmdId: enrol.command.cmdId });
  }
  if (chosen === 'pyzk_remote') {
    const sidecar = getSidecar();
    await sidecar.upsertUser(terminal.terminalIP, { user_id: pin, name: student.name.slice(0, 24), privilege: 0, templates: [] });
    let result;
    try {
      result = await sidecar.enroll(terminal.terminalIP, { userId: pin, fingerIndex: finger });
    } catch (error) {
      result = { ok: false, detail: error.message };
    }
    steps.push({ step: 'sidecar_enroll', ok: Boolean(result?.ok), detail: result?.detail || '' });
    if (!result?.ok) {
      await setEnrollmentState(student._id, 'failed', `Capture failed on the device: ${result?.detail || 'enroll_user returned false'}`);
    } else {
      // Capture succeeded on the device; read the template back now.
      await fetchEnrollmentTemplate(student._id, { terminalSN: terminal.deviceSN, actor });
    }
  }

  await recordBiometricAudit({
    actor,
    action: 'enroll_start',
    student,
    terminal: terminal.deviceSN,
    details: { method: chosen, pin, fingerIndex: finger, steps },
  });

  const fresh = await Student.findById(student._id).select('enrollmentState enrollmentError').lean();
  return {
    pin,
    method: chosen,
    fingerIndex: finger,
    enrollmentState: fresh?.enrollmentState,
    enrollmentError: fresh?.enrollmentError || '',
    simulated: Boolean(terminal.simulated),
    terminal: { deviceSN: terminal.deviceSN, terminalLabel: terminal.terminalLabel },
    steps,
    instructions:
      chosen === 'menu'
        ? `On ${terminal.terminalLabel || terminal.deviceSN}: open the menu, choose User Management, find user ID ${pin} and enrol finger ${finger}. The template will be picked up automatically (push upload) or with "Fetch template".`
        : chosen === 'push_remote'
          ? 'The terminal should prompt the student to place their finger (UNVERIFIED on X990).'
          : 'The sidecar asked the terminal to start enrolment. Ask the student to place their finger.',
  };
};

/**
 * Read the template(s) for the student's PIN from the enrollment terminal via the
 * sidecar and store them. Without a sidecar a TEMPLATE_QUERY is queued over push
 * (the terminal answers by uploading FINGERTMP; UNVERIFIED).
 */
const fetchEnrollmentTemplate = async (studentId, { terminalSN, actor = 'system' } = {}) => {
  const student = await Student.findOne({ _id: studentId, isActive: true });
  if (!student) throw httpError(404, 'Student not found');
  if (!student.zktUserID) throw httpError(409, 'Student has no PIN; start enrolment first');
  const pin = String(student.zktUserID);
  const terminal = await resolveEnrollmentTerminal(terminalSN);
  const sidecar = getSidecar();

  if (!sidecar) {
    const { command } = await enqueueCommand({ terminal, type: 'TEMPLATE_QUERY', student, pin, params: { pin } });
    return { mode: 'push_query', cmdId: command.cmdId, stored: 0 };
  }

  const { templates = [] } = (await sidecar.getTemplates(terminal.terminalIP, { userId: pin })) || {};
  await recordBiometricAudit({
    actor,
    action: 'template_read',
    student,
    terminal: terminal.deviceSN,
    details: { channel: 'sidecar', count: templates.length },
  });

  let stored = 0;
  for (const tpl of templates) {
    if (String(tpl.user_id) !== pin) continue;
    let result;
    try {
      result = await storeTemplate({
      student,
      pin,
      fingerIndex: Number(tpl.fid),
      flag: Number(tpl.valid ?? 1),
      sizeReported: tpl.size ?? null,
      template: tpl.template,
      sourceTerminal: terminal.deviceSN,
      channel: 'sidecar',
      dialect: 'zk_tcp',
      algorithmVersion: terminal.algorithmVersion || '',
      actor,
      simulated: Boolean(terminal.simulated),
      });
    } catch (error) {
      if (error.code === 'DUPLICATE_TEMPLATE') {
        await setEnrollmentState(student._id, 'failed', error.message);
        throw error;
      }
      throw error;
    }
    if (result.changed) stored += 1;
  }

  const found = templates.filter((t) => String(t.user_id) === pin).length;
  if (found) {
    const { onTemplateStored } = require('../sync/terminalSyncService');
    await onTemplateStored(student, { sourceTerminal: terminal.deviceSN, actor, simulated: Boolean(terminal.simulated) });
  }
  return { mode: 'sidecar', found, stored, simulated: Boolean(terminal.simulated) };
};

const getEnrollmentStatus = async (studentId) => {
  const student = await Student.findById(studentId)
    .select('name sapId zktUserID fingerprintStatus enrollmentMethod enrollmentStartedAt fingerprintEnrolledAt consentRef targetTerminalGroups enrollmentState enrollmentError enrollmentTerminalSN enrollmentDeviceSN enrollmentSimulated syncStatus gateSync accessStatus')
    .lean();
  if (!student) throw httpError(404, 'Student not found');
  return {
    ...student,
    pin: student.zktUserID ? String(student.zktUserID) : null,
    consent: await hasActiveConsent(student),
  };
};

module.exports = {
  expireEnrollments,
  setEnrollmentState,
  startEnrollment,
  fetchEnrollmentTemplate,
  getEnrollmentStatus,
  listEnrollmentMethods,
  resolveEnrollmentTerminal,
};
