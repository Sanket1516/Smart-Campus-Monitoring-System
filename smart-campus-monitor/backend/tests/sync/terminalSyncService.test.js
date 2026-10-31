const { mockAllModels, resetModels } = require('../helpers/syncTestEnv');

mockAllModels(jest);

const TerminalConfig = require('../../models/TerminalConfig');
const TerminalCommand = require('../../models/TerminalCommand');
const TerminalUserState = require('../../models/TerminalUserState');
const BiometricTemplate = require('../../models/BiometricTemplate');
const BiometricAuditLog = require('../../models/BiometricAuditLog');
const Student = require('../../models/Student');
const SyncJob = require('../../models/SyncJob');
const sync = require('../../services/sync/terminalSyncService');
const queue = require('../../services/sync/commandQueue');
const { storeTemplate, loadTemplateValue } = require('../../services/sync/templateStore');
const { resetSyncConfig } = require('../../config/terminalSync');
const { resetPinAllocatorForTests } = require('../../services/sync/pinAllocator');
const { setSidecarForTests } = require('../../services/sidecar');
const { createFakeSidecar } = require('../../services/sidecar/fakeSidecar');
const groups = require('../../services/sync/groups');

const TMP = Buffer.from('template-bytes-for-tests-0123456789').toString('base64');
const HOSTEL = '64b000000000000000000001';

const openCommands = (filter = {}) => TerminalCommand.find({ open: true, ...filter }).lean();

describe('terminalSyncService', () => {
  beforeEach(async () => {
    resetModels();
    resetSyncConfig();
    resetPinAllocatorForTests();
    setSidecarForTests(null);
    await TerminalConfig.create({ deviceSN: 'ENR1', isEnrollmentStation: true, role: 'enrollment', terminalType: 'ENROLLMENT' });
    await TerminalConfig.create({ deviceSN: 'GATE1', terminalType: 'MAIN_GATE', isOnline: true });
    await TerminalConfig.create({ deviceSN: 'GATE2', terminalType: 'MAIN_GATE', isOnline: false }); // offline
    await TerminalConfig.create({ deviceSN: 'HOS1', terminalType: 'HOSTEL', hostel: HOSTEL });
    await TerminalConfig.create({ deviceSN: 'OFF1', terminalType: 'MAIN_GATE', enabled: false });
  });

  const makeStudent = (extra = {}) =>
    Student.create({ sapId: `S${Math.random()}`, name: 'Asha Rao', studentType: 'day_scholar', ...extra });

  describe('groups', () => {
    it('derives default groups for terminals and students', () => {
      expect(groups.terminalGroups({ terminalType: 'MAIN_GATE' })).toEqual(['gate']);
      expect(groups.terminalGroups({ terminalType: 'HOSTEL', hostel: HOSTEL })).toEqual([`hostel:${HOSTEL}`]);
      expect(groups.terminalGroups({ isEnrollmentStation: true })).toEqual(['enrollment']);
      expect(groups.terminalGroups({ groups: ['Library', 'gate'] })).toEqual(['library', 'gate']);
      expect(groups.studentGroups({ studentType: 'hosteller', hostel: HOSTEL })).toEqual(['gate', `hostel:${HOSTEL}`]);
      expect(groups.studentGroups({ targetTerminalGroups: ['library'] })).toEqual(['library']);
    });
  });

  it('adding a student queues user records on every target terminal and assigns one PIN', async () => {
    const student = await makeStudent({ studentType: 'hosteller', isHosteller: true, hostel: HOSTEL });
    const result = await sync.enqueueProvision(student);
    expect(result.pin).toBe('1');
    expect(result.terminals.sort()).toEqual(['GATE1', 'GATE2', 'HOS1']);
    const cmds = await openCommands({ type: 'USER_CREATE' });
    expect(cmds.map((c) => c.terminalSN).sort()).toEqual(['GATE1', 'GATE2', 'HOS1']);
    expect(cmds.every((c) => c.text === 'DATA UPDATE USERINFO PIN=1\tName=Asha Rao\tPri=0\tGrp=1')).toBe(true);
    // enrollment and disabled terminals are not targets
    expect(cmds.find((c) => ['ENR1', 'OFF1'].includes(c.terminalSN))).toBeUndefined();

    const second = await makeStudent();
    expect((await sync.enqueueProvision(second)).pin).toBe('2');
  });

  it('is safe to run repeatedly (no duplicate commands)', async () => {
    const student = await makeStudent();
    await storeTemplate({ student, pin: '1', fingerIndex: 0, template: TMP });
    await sync.enqueueProvision(student);
    await sync.enqueueProvision(student);
    await sync.enqueueProvision(student);
    expect(await TerminalCommand.countDocuments({ open: true })).toBe(4); // 2 gates x (user + template)
  });

  it('blocking queues deletes on every enabled GATE terminal (incl. offline), keeps the enrolment device, cancels pending creates', async () => {
    const student = await makeStudent();
    await sync.enqueueProvision(student);
    student.accessStatus = 'blocked';
    await student.save();
    const result = await sync.enqueueDelete(student, { reason: 'block' });
    expect(result.terminals.sort()).toEqual(['GATE1', 'GATE2', 'HOS1']);
    expect(await TerminalCommand.countDocuments({ type: 'USER_CREATE', open: true })).toBe(0);
    expect(await TerminalCommand.countDocuments({ type: 'USER_CREATE', status: 'cancelled' })).toBe(2);
    const deletes = await openCommands({ type: 'USER_DELETE' });
    expect(deletes.map((d) => d.text)).toEqual(Array(3).fill('DATA DELETE USERINFO PIN=1'));
    expect(deletes.find((d) => d.terminalSN === 'ENR1')).toBeUndefined();
    expect(await BiometricAuditLog.countDocuments({ action: 'block' })).toBe(1);
  });

  it('a blocked student is never provisioned', async () => {
    const student = await makeStudent({ accessStatus: 'blocked' });
    expect(await sync.enqueueProvision(student)).toMatchObject({ skipped: true });
    expect(await TerminalCommand.countDocuments({})).toBe(0);
  });

  it('unblock restores user + stored templates without recapture', async () => {
    const student = await makeStudent({ zktUserID: 77, accessStatus: 'blocked' });
    await storeTemplate({ student, pin: '77', fingerIndex: 0, template: TMP });
    await storeTemplate({ student, pin: '77', fingerIndex: 5, template: TMP.replace(/^./, 'A') });
    await sync.enqueueDelete(student);
    student.accessStatus = 'allowed';
    await student.save();
    const result = await sync.enqueueRestore(student);
    expect(result.templates).toBe(2);
    expect(await TerminalCommand.countDocuments({ type: 'USER_DELETE', open: true, terminalSN: { $in: ['GATE1', 'GATE2'] } })).toBe(0);
    const writes = await openCommands({ type: 'TEMPLATE_WRITE' });
    expect(writes).toHaveLength(4);
    const sent = await queue.takeNextCommands('GATE1', { max: 10, strictOrder: false });
    expect(sent.map((s) => s.type)).toEqual(['USER_CREATE', 'TEMPLATE_WRITE', 'TEMPLATE_WRITE']);
    expect(sent.filter((s) => s.type === 'TEMPLATE_WRITE').map((s) => s.text)[0]).toContain(`TMP=${TMP}`);
    expect(sent.findIndex((s) => s.type === 'USER_CREATE')).toBeLessThan(sent.findIndex((s) => s.type === 'TEMPLATE_WRITE'));
  });

  it('template stored after enrolment flips the student to enrolled and fans out', async () => {
    const student = await makeStudent({ zktUserID: 5, fingerprintStatus: 'awaiting' });
    await storeTemplate({ student, pin: '5', fingerIndex: 0, template: TMP, sourceTerminal: 'ENR1' });
    await sync.onTemplateStored(student, { sourceTerminal: 'ENR1' });
    const fresh = await Student.findById(student._id).lean();
    expect(fresh).toMatchObject({ fingerprintStatus: 'enrolled', fingerprintEnrolled: true });
    expect((await openCommands({ type: 'TEMPLATE_WRITE' })).map((c) => c.terminalSN).sort()).toEqual(['GATE1', 'GATE2']);
  });

  it('templates are stored encrypted and round-trip exactly', async () => {
    const student = await makeStudent({ zktUserID: 9 });
    const { template } = await storeTemplate({ student, pin: '9', fingerIndex: 3, flag: 3, sizeReported: 35, template: TMP });
    const raw = BiometricTemplate._store()[0];
    expect(Buffer.from(raw.dataEncrypted).toString('utf8')).not.toContain(TMP);
    expect(template.dataEncrypted).toBeUndefined();
    expect(template.dataIv).toBeUndefined();
    const value = await loadTemplateValue(raw._id);
    expect(value).toMatchObject({ value: TMP, fingerIndex: 3, flag: 3, sizeBytes: 35 });
  });

  it('group change prunes the student from terminals they left', async () => {
    const student = await makeStudent({ zktUserID: 11 });
    await sync.enqueueProvision(student);
    await TerminalUserState.create({ terminalSN: 'GATE1', pin: '11', student: student._id, present: true, source: 'ack' });
    await TerminalConfig.updateOne({ deviceSN: 'GATE2' }, { $set: { groups: ['library'] } });
    student.targetTerminalGroups = ['library'];
    await student.save();
    const result = await sync.enqueueProvision(student);
    expect(result.terminals).toEqual(['GATE2']);
    expect(result.pruned).toBe(1);
    expect((await openCommands({ type: 'USER_DELETE' })).map((c) => c.terminalSN)).toEqual(['GATE1']);
  });

  it('de-enrol and erase deletes from all terminals and from the database', async () => {
    const student = await makeStudent({ zktUserID: 12, fingerprintStatus: 'enrolled', fingerprintEnrolled: true });
    await storeTemplate({ student, pin: '12', fingerIndex: 0, template: TMP });
    const result = await sync.deEnrolAndErase(student, { reason: 'student_left' });
    expect(result.templatesErased).toBe(1);
    expect(await BiometricTemplate.countDocuments({ student: student._id })).toBe(0);
    expect(await TerminalCommand.countDocuments({ type: 'USER_DELETE', open: true })).toBe(4);
    expect(await Student.findById(student._id).lean()).toMatchObject({ fingerprintStatus: 'none', fingerprintEnrolled: false });
    expect(await BiometricAuditLog.countDocuments({ action: 'erase' })).toBe(1);
  });

  it('new terminal: small sets go through the push queue', async () => {
    await makeStudent({ zktUserID: 21 });
    await makeStudent({ zktUserID: 22, accessStatus: 'blocked' });
    await makeStudent({ zktUserID: 23, studentType: 'hosteller', isHosteller: true, hostel: HOSTEL });
    const gate3 = await TerminalConfig.create({ deviceSN: 'GATE3', terminalType: 'MAIN_GATE' });
    const result = await sync.enqueueForNewTerminal(gate3.toObject());
    expect(result).toMatchObject({ mode: 'push', students: 2 });
    expect((await openCommands({ terminalSN: 'GATE3' })).map((c) => c.pin).sort()).toEqual(['21', '23']);
  });

  it('new terminal: large sets use the sidecar bulk loader (resumable job)', async () => {
    process.env.SYNC_BULK_THRESHOLD = '1';
    process.env.SYNC_BULK_DELAY_MS = '0';
    resetSyncConfig();
    const sidecar = createFakeSidecar();
    setSidecarForTests(sidecar);
    const a = await makeStudent({ zktUserID: 31 });
    await makeStudent({ zktUserID: 32 });
    await storeTemplate({ student: a, pin: '31', fingerIndex: 0, template: TMP });
    const gate4 = await TerminalConfig.create({ deviceSN: 'GATE4', terminalType: 'MAIN_GATE', terminalIP: '10.0.0.44' });
    const result = await sync.enqueueForNewTerminal(gate4.toObject());
    expect(result.mode).toBe('sidecar');
    // The job runs in the background; wait for it.
    let job;
    for (let i = 0; i < 100; i += 1) {
      job = await SyncJob.findOne({ jobId: result.jobId }).lean();
      if (job.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(job).toMatchObject({ status: 'completed', done: 2, cursor: 2 });
    const device = sidecar.devices.get('10.0.0.44');
    expect(Array.from(device.users.keys()).sort()).toEqual(['31', '32']);
    expect(device.templates.get('31:0').template).toBe(TMP);
    expect(await TerminalUserState.countDocuments({ terminalSN: 'GATE4', present: true })).toBe(2);
    delete process.env.SYNC_BULK_THRESHOLD;
    delete process.env.SYNC_BULK_DELAY_MS;
  });

  it('bulk load pauses when the terminal is offline and resumes later', async () => {
    process.env.SYNC_BULK_DELAY_MS = '0';
    resetSyncConfig();
    const sidecar = createFakeSidecar();
    setSidecarForTests(sidecar);
    await makeStudent({ zktUserID: 41 });
    const gate5 = await TerminalConfig.create({ deviceSN: 'GATE5', terminalType: 'MAIN_GATE', terminalIP: '10.0.0.55' });
    sidecar.setOffline('10.0.0.55', true);
    const { startBulkLoad, runBulkJob } = require('../../services/sync/bulkLoader');
    const students = await Student.find({ zktUserID: 41 }).lean();
    const job = await startBulkLoad({ terminal: gate5.toObject(), studentIds: students.map((s) => s._id), run: false });
    expect((await runBulkJob(job.jobId)).status).toBe('paused');
    sidecar.setOffline('10.0.0.55', false);
    await SyncJob.updateOne({ jobId: job.jobId }, { $set: { status: 'queued' } });
    expect((await runBulkJob(job.jobId)).status).toBe('completed');
    delete process.env.SYNC_BULK_DELAY_MS;
  });

  it('per-student sync status reports present / pending / failed per terminal', async () => {
    const student = await makeStudent({ zktUserID: 51 });
    await sync.enqueueProvision(student);
    const [cmd] = await queue.takeNextCommands('GATE1');
    await queue.applyAck({ terminalSN: 'GATE1', id: cmd.cmdId, returnCode: 0 });
    const status = await sync.getStudentSyncStatus(student._id);
    const byTerminal = Object.fromEntries(status.terminals.map((t) => [t.terminalSN, t.status]));
    expect(byTerminal).toMatchObject({ GATE1: 'present', GATE2: 'pending', ENR1: 'absent' });
    expect(JSON.stringify(status)).not.toMatch(/dataEncrypted|TMP=/);
  });
});
