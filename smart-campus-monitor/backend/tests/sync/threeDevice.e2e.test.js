/**
 * Three-device architecture, end to end (SIMULATED terminals over real HTTP):
 *   Device 1 ADMIN_ENROLLMENT, Device 2 GATE_ENTRY, Device 3 GATE_EXIT.
 * Real /iclock router, real queue, real sync service, real scan pipeline; in-memory models.
 */
const { mockAllModels, resetModels } = require('../helpers/syncTestEnv');

mockAllModels(jest);
['EntryLog', 'UnauthorizedLog', 'HostellerRequest', 'AccessControlLog'].forEach((mockName) => {
  jest.mock(`../../models/${mockName}`, () => require('../helpers/memoryModel').createMemoryModel(mockName));
});
jest.mock('../../services/configService', () => ({
  getSystemConfiguration: jest.fn().mockResolvedValue({ maintenanceMode: false }),
  isPastCurfew: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../services/notification', () => ({ notifyParent: jest.fn().mockResolvedValue() }));

const express = require('express');
const TerminalConfig = require('../../models/TerminalConfig');
const TerminalCommand = require('../../models/TerminalCommand');
const Student = require('../../models/Student');
const BiometricTemplate = require('../../models/BiometricTemplate');
const AttendancePunch = require('../../models/AttendancePunch');
const EntryLog = require('../../models/EntryLog');
const { resetSyncConfig } = require('../../config/terminalSync');
const { resetPinAllocatorForTests } = require('../../services/sync/pinAllocator');
const { createIclockRouter } = require('../../routes/iclock');
const { FakeTerminal } = require('../../tools/fakeTerminal');
const { recordConsent } = require('../../services/sync/consentService');
const { startEnrollment, expireEnrollments } = require('../../services/enrollment/enrollmentService');
const { recomputeStudentSyncStatus } = require('../../services/sync/syncStatus');
const { assertDeviceRoleAvailable } = require('../../services/terminals/deviceRoles');
const { setSidecarForTests } = require('../../services/sidecar');
const { createFakeSidecar } = require('../../services/sidecar/fakeSidecar');
const { runPullCycleForTerminal } = require('../../services/sync/pullExecutor');
const sync = require('../../services/sync/terminalSyncService');

let server;
let baseUrl;
const flush = () => new Promise((resolve) => setImmediate(resolve));

const startServer = async () => {
  const app = express();
  app.use('/iclock', createIclockRouter());
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
};

const registerThreeDevices = async ({ simulatedEnrollment = false } = {}) => {
  const base = { scansToday: 0, totalScans: 0, gateName: 'Main Gate', gateNumber: 1, dialect: 'classic' };
  await TerminalConfig.create({ ...base, deviceSN: 'DEV1', machineNumber: 50, isEnrollmentStation: true, role: 'enrollment', deviceRole: 'ADMIN_ENROLLMENT', terminalType: 'ENROLLMENT', terminalLabel: 'Admin Enrollment', simulated: simulatedEnrollment });
  await TerminalConfig.create({ ...base, deviceSN: 'DEV2', machineNumber: 101, deviceRole: 'GATE_ENTRY', terminalType: 'MAIN_GATE', terminalLabel: 'Gate Entry', terminalNumber: 1 });
  await TerminalConfig.create({ ...base, deviceSN: 'DEV3', machineNumber: 102, deviceRole: 'GATE_EXIT', terminalType: 'MAIN_GATE', terminalLabel: 'Gate Exit', terminalNumber: 2 });
};

const enrolStudent = async (dev1, { sapId = 'STU1001', name = 'Asha Rao' } = {}) => {
  const student = await Student.create({ sapId, name, category: 'dayscholars', department: 'CS', fingerprintStatus: 'awaiting' });
  await sync.enqueueProvision(student);
  await recordConsent({ student, isMinor: false, givenBy: 'self', giverName: name, method: 'paper' });
  const started = await startEnrollment(student._id, { method: 'menu' });
  await dev1.drain();
  const { template } = await dev1.enrolOnMenu(started.pin, 0);
  return { student, pin: started.pin, template };
};

const statusOf = async (studentId) => {
  await flush();
  return recomputeStudentSyncStatus(studentId);
};

describe('three-device architecture (SIMULATED terminals)', () => {
  let dev1;
  let entry;
  let exit;

  beforeEach(async () => {
    resetModels();
    ['EntryLog', 'UnauthorizedLog', 'HostellerRequest', 'AccessControlLog'].forEach((name) => require(`../../models/${name}`)._reset());
    delete process.env.SIMULATION_MODE;
    delete process.env.SYNC_ACK_COUNTS_AS_VERIFIED;
    resetSyncConfig();
    resetPinAllocatorForTests();
    setSidecarForTests(null);
    await registerThreeDevices();
    await startServer();
    dev1 = new FakeTerminal({ baseUrl, sn: 'DEV1' });
    entry = new FakeTerminal({ baseUrl, sn: 'DEV2' });
    exit = new FakeTerminal({ baseUrl, sn: 'DEV3' });
  });

  afterEach(() => new Promise((resolve) => server.close(resolve)));

  it('prevents duplicate single-instance roles', async () => {
    await expect(assertDeviceRoleAvailable(TerminalConfig, { deviceRole: 'GATE_ENTRY' })).rejects.toMatchObject({ statusCode: 409 });
    const own = await TerminalConfig.findOne({ deviceSN: 'DEV2' }).lean();
    await expect(assertDeviceRoleAvailable(TerminalConfig, { _id: own._id, deviceRole: 'GATE_ENTRY' })).resolves.toBe(true);
    await expect(assertDeviceRoleAvailable(TerminalConfig, { deviceRole: 'GATE_TOGGLE' })).resolves.toBe(true);
    await expect(assertDeviceRoleAvailable(TerminalConfig, { deviceRole: 'GATE_EXIT', enabled: false })).resolves.toBe(true);
  });

  it('enrol once on Device 1 → both gates receive and verify → FULLY_SYNCHRONIZED; entry/exit by role', async () => {
    const { student, pin, template } = await enrolStudent(dev1);
    let fresh = await Student.findById(student._id).lean();
    expect(fresh).toMatchObject({ fingerprintStatus: 'enrolled', enrollmentState: 'captured', enrollmentDeviceSN: 'DEV1', enrollmentSimulated: false });

    // Only Device 2 is online so far.
    await entry.drain();
    let status = await statusOf(student._id);
    expect(status.syncStatus).toBe('PARTIALLY_SYNCHRONIZED');
    expect(status.gateSync.find((g) => g.terminalSN === 'DEV2').status).toBe('verified');
    expect(status.gateSync.find((g) => g.terminalSN === 'DEV3').status).toBe('pending');

    // Device 3 comes online and catches up automatically (offline recovery).
    await exit.drain();
    status = await statusOf(student._id);
    expect(status.syncStatus).toBe('FULLY_SYNCHRONIZED');
    expect(entry.templates.get(`${pin}:0`).template).toBe(template);
    expect(exit.templates.get(`${pin}:0`).template).toBe(template);

    // Gate templates were used only as read-back evidence, never as new enrolments.
    expect(await BiometricTemplate.countDocuments({})).toBe(1);

    // Device 2 always records ENTRY, Device 3 always EXIT; repeats inside the window are duplicates.
    await entry.punch(pin);
    await entry.punch(pin, new Date(Date.now() + 5000));
    await exit.punch(pin, new Date(Date.now() + 10000));
    await exit.punch(pin, new Date(Date.now() + 12000));
    const punches = await AttendancePunch.find({ pin }).sort({ deviceTimeRaw: 1 }).lean();
    expect(punches.map((p) => [p.direction, p.decision.action, p.decision.duplicate])).toEqual([
      ['entry', 'entry', false],
      ['entry', 'entry', true],
      ['exit', 'exit', false],
      ['exit', 'exit', true],
    ]);
    const logs = await EntryLog.find({ sapId: 'STU1001' }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: 'exited', deviceSN: 'DEV3' });
    fresh = await Student.findById(student._id).lean();
    expect(fresh.syncStatus).toBe('FULLY_SYNCHRONIZED');
  });

  it('exit punch without an entry creates an exit-only record; GATE_EXIT never records entry', async () => {
    const { pin } = await enrolStudent(dev1, { sapId: 'STU2002' });
    await exit.drain();
    await exit.punch(pin);
    const logs = await EntryLog.find({ sapId: 'STU2002' }).lean();
    expect(logs).toEqual([expect.objectContaining({ status: 'exited', entryTime: null })]);
  });

  it('PARTIALLY_SYNCHRONIZED when the exit gate rejects the template; never FULLY', async () => {
    const { student } = await enrolStudent(dev1);
    exit.failPattern = /FINGERTMP/;
    await entry.drain();
    await exit.drain();
    const status = await statusOf(student._id);
    expect(status.syncStatus).toBe('PARTIALLY_SYNCHRONIZED');
    expect(status.gateSync.find((g) => g.terminalSN === 'DEV3')).toMatchObject({ status: 'failed' });
    expect(status.gateSync.find((g) => g.terminalSN === 'DEV3').detail).toMatch(/-2/);
  });

  it('SYNCHRONIZED_UNVERIFIED when gates ack but cannot be read back', async () => {
    const { student } = await enrolStudent(dev1);
    entry.answerTemplateQueries = false;
    exit.answerTemplateQueries = false;
    await entry.drain();
    await exit.drain();
    expect((await statusOf(student._id)).syncStatus).toBe('SYNCHRONIZED_UNVERIFIED');
  });

  it('block removes from both gates only (Device 1 keeps it); unblock restores without recapture', async () => {
    const { student, pin, template } = await enrolStudent(dev1);
    await entry.drain();
    await exit.drain();

    await Student.updateOne({ _id: student._id }, { $set: { accessStatus: 'blocked' } });
    await sync.enqueueDelete(student._id, { reason: 'block' });
    expect((await statusOf(student._id)).syncStatus).toBe('BLOCK_PENDING');
    // Rejected in software immediately, even before the gates processed the delete.
    await entry.punch(pin);
    expect((await AttendancePunch.findOne({ pin }).lean()).decision).toMatchObject({ allow: false, reason: 'blocked' });

    await entry.drain();
    await exit.drain();
    await dev1.drain();
    expect(entry.users.has(pin) || exit.users.has(pin)).toBe(false);
    expect(dev1.templates.get(`${pin}:0`).template).toBe(template); // enrolment device retains it
    expect((await statusOf(student._id)).syncStatus).toBe('BLOCKED_REMOVED');

    await Student.updateOne({ _id: student._id }, { $set: { accessStatus: 'allowed' } });
    await sync.enqueueRestore(student._id);
    await entry.drain();
    await exit.drain();
    expect(entry.templates.get(`${pin}:0`).template).toBe(template);
    expect(exit.templates.get(`${pin}:0`).template).toBe(template);
    expect((await statusOf(student._id)).syncStatus).toBe('FULLY_SYNCHRONIZED');
  });

  it('permanent de-enrolment deletes from all three devices and MongoDB; denied in software at once', async () => {
    const { student, pin } = await enrolStudent(dev1);
    await entry.drain();
    await exit.drain();
    await sync.deEnrolAndErase(student._id);
    await entry.punch(pin);
    expect((await AttendancePunch.findOne({ pin }).lean()).decision).toMatchObject({ allow: false, reason: 'de_enrolled' });
    await Promise.all([dev1.drain(), entry.drain(), exit.drain()]);
    expect([dev1, entry, exit].some((t) => t.users.has(pin))).toBe(false);
    expect(await BiometricTemplate.countDocuments({})).toBe(0);
    expect((await Student.findById(student._id).lean()).syncStatus).toBe('NOT_ENROLLED');
  });

  it('enrolment timeout and exact-duplicate template are reported, never silently accepted', async () => {
    const student = await Student.create({ sapId: 'STU3', name: 'T', category: 'dayscholars', department: 'CS' });
    await recordConsent({ student, isMinor: false, givenBy: 'self', giverName: 'T' });
    await startEnrollment(student._id, { method: 'menu' });
    await Student.updateOne({ _id: student._id }, { $set: { enrollmentStartedAt: new Date(Date.now() - 3600 * 1000) } });
    expect(await expireEnrollments()).toBe(1);
    expect((await Student.findById(student._id).lean()).enrollmentState).toBe('timeout');

    const { template } = await enrolStudent(dev1, { sapId: 'STU4' });
    const other = await Student.create({ sapId: 'STU5', name: 'Other', category: 'dayscholars', department: 'CS' });
    await recordConsent({ student: other, isMinor: false, givenBy: 'self', giverName: 'O' });
    const started = await startEnrollment(other._id, { method: 'menu' });
    await dev1.drain();
    await dev1.enrolOnMenu(started.pin, 0, template); // identical bytes
    const fresh = await Student.findById(other._id).lean();
    expect(fresh).toMatchObject({ enrollmentState: 'failed', fingerprintStatus: 'awaiting' });
    expect(fresh.enrollmentError).toMatch(/already stored for another student/);
  });

  it('templates uploaded by a gate are never stored as enrolments', async () => {
    const student = await Student.create({ sapId: 'STU6', name: 'G', category: 'dayscholars', department: 'CS', zktUserID: 66 });
    await recordConsent({ student, isMinor: false, givenBy: 'self', giverName: 'G' });
    await entry.enrolOnMenu('66', 0);
    expect(await BiometricTemplate.countDocuments({})).toBe(0);
  });

  it('SIMULATED enrolment device: refused unless SIMULATION_MODE; its templates never reach real gates', async () => {
    await TerminalConfig.updateOne({ deviceSN: 'DEV1' }, { $set: { simulated: true } });
    expect((await dev1.handshake()).status).toBe(403);

    process.env.SIMULATION_MODE = 'true';
    resetSyncConfig();
    const { student, pin } = await enrolStudent(dev1, { sapId: 'SIM1' });
    expect(await BiometricTemplate.findOne({}).lean()).toMatchObject({ simulated: true });
    expect((await Student.findById(student._id).lean()).enrollmentSimulated).toBe(true);
    await entry.drain();
    expect(entry.templates.has(`${pin}:0`)).toBe(false); // real gate got the user record only
    const status = await statusOf(student._id);
    expect(status.gateSync.find((g) => g.terminalSN === 'DEV2').detail).toMatch(/SIMULATED/);
    expect(status.syncStatus).not.toBe('FULLY_SYNCHRONIZED');
  });

  it('pull-mode gate (zk_tcp_pull): queue executed and attendance pulled through the sidecar', async () => {
    const sidecar = createFakeSidecar();
    setSidecarForTests(sidecar);
    await TerminalConfig.updateOne({ deviceSN: 'DEV3' }, { $set: { communicationProtocol: 'zk_tcp_pull', terminalIP: '10.20.0.13' } });
    const { student, pin, template } = await enrolStudent(dev1);
    const gate = await TerminalConfig.findOne({ deviceSN: 'DEV3' }).lean();
    await runPullCycleForTerminal(gate);
    await flush();
    await flush();
    expect(sidecar.devices.get('10.20.0.13').templates.get(`${pin}:0`).template).toBe(template);
    expect((await statusOf(student._id)).gateSync.find((g) => g.terminalSN === 'DEV3').status).toBe('verified');

    const local = new Date(Date.now() + 330 * 60000).toISOString().replace('T', ' ').slice(0, 19);
    sidecar.addPunch('10.20.0.13', { user_id: pin, timestamp: local, status: 1, punch: 1 });
    await runPullCycleForTerminal(await TerminalConfig.findOne({ deviceSN: 'DEV3' }).lean());
    const punch = await AttendancePunch.findOne({ terminalSN: 'DEV3' }).lean();
    expect(punch).toMatchObject({ source: 'zk_tcp_pull', direction: 'exit' });
    expect(punch.decision).toMatchObject({ allow: true, action: 'exit' });
  });
});
