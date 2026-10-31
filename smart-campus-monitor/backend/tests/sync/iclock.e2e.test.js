/**
 * End-to-end: fake ADMS terminals (tools/fakeTerminal.js) talk HTTP to the real
 * /iclock router; ATTLOG punches run through the real scan/decision pipeline.
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
const AttendancePunch = require('../../models/AttendancePunch');
const BiometricTemplate = require('../../models/BiometricTemplate');
const AlertLog = require('../../models/AlertLog');
const EntryLog = require('../../models/EntryLog');
const { resetSyncConfig } = require('../../config/terminalSync');
const { resetPinAllocatorForTests } = require('../../services/sync/pinAllocator');
const { createIclockRouter } = require('../../routes/iclock');
const { FakeTerminal } = require('../../tools/fakeTerminal');
const { recordConsent } = require('../../services/sync/consentService');
const { startEnrollment } = require('../../services/enrollment/enrollmentService');
const sync = require('../../services/sync/terminalSyncService');

let server;
let baseUrl;

const startServer = async () => {
  const app = express();
  app.use('/iclock', createIclockRouter());
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
};

const stopServer = () => new Promise((resolve) => (server ? server.close(resolve) : resolve()));

describe('/iclock push server with fake terminals', () => {
  beforeEach(async () => {
    resetModels();
    ['EntryLog', 'UnauthorizedLog', 'HostellerRequest', 'AccessControlLog'].forEach((name) => require(`../../models/${name}`)._reset());
    delete process.env.ADMS_ALLOWED_CIDRS;
    resetSyncConfig();
    resetPinAllocatorForTests();
    await TerminalConfig.create({ deviceSN: 'ENR1', machineNumber: 50, isEnrollmentStation: true, role: 'enrollment', terminalType: 'ENROLLMENT', terminalLabel: 'Enrollment' });
    await TerminalConfig.create({ deviceSN: 'GATE1', machineNumber: 101, terminalType: 'MAIN_GATE', terminalLabel: 'Main Gate 1', gateName: 'Main Gate', gateNumber: 1, terminalNumber: 1, scansToday: 0, totalScans: 0 });
    await TerminalConfig.create({ deviceSN: 'GATE2', machineNumber: 102, terminalType: 'MAIN_GATE', terminalLabel: 'Main Gate 2', gateName: 'Main Gate', gateNumber: 1, terminalNumber: 2, scansToday: 0, totalScans: 0 });
    await startServer();
  });

  afterEach(stopServer);

  const terminal = (sn, dialect = 'classic') => new FakeTerminal({ baseUrl, sn, dialect });

  it('handshake returns the option block and detects the classic dialect by probe', async () => {
    const gate = terminal('GATE1');
    const hs = await gate.handshake();
    expect(hs.status).toBe(200);
    expect(hs.text.split('\n')[0]).toBe('GET OPTION FROM: GATE1');
    expect(gate.options).toMatchObject({ Realtime: '1', Encrypt: '0' });
    const { results } = await gate.poll();
    expect(results).toEqual([{ id: 1, command: 'DATA QUERY USERINFO PIN=999999999', returnCode: 0 }]);
    const saved = await TerminalConfig.findOne({ deviceSN: 'GATE1' }).lean();
    expect(saved).toMatchObject({ dialect: 'classic', dialectSource: 'probe', pushVersion: '2.4.1', firmware: 'Ver 6.60 FAKE', status: 'online' });
  });

  it('falls back to the v3 dialect when the classic probe answers -1004', async () => {
    const gate = terminal('GATE1', 'v3');
    await gate.handshake();
    expect((await gate.poll()).results[0].returnCode).toBe(-1004);
    expect((await gate.poll()).results[0]).toMatchObject({ command: 'DATA QUERY user Pin=999999999', returnCode: 0 });
    expect((await TerminalConfig.findOne({ deviceSN: 'GATE1' }).lean()).dialect).toBe('v3');
  });

  it('refuses unknown serials and non-terminal IPs', async () => {
    const rogue = terminal('ROGUE');
    expect((await rogue.handshake()).status).toBe(403);
    expect(await AlertLog.countDocuments({ type: 'unknown_terminal' })).toBe(1);
    await stopServer();
    process.env.ADMS_ALLOWED_CIDRS = '10.20.0.0/16';
    resetSyncConfig();
    await startServer();
    expect((await terminal('GATE1').handshake()).status).toBe(403);
  });

  it('full flow: enrol on menu, fan out, block (software deny + delete), unblock (restore), erase', async () => {
    const enr = terminal('ENR1');
    const gate = terminal('GATE1');
    await enr.handshake();
    await gate.handshake();
    await enr.drain();
    await gate.drain();

    // Student added: user record goes to the gates automatically.
    const student = await Student.create({ sapId: '5001', name: 'Asha Rao', category: 'dayscholars', department: 'CS' });
    await sync.enqueueProvision(student);
    await gate.drain();
    expect(Array.from(gate.users.keys())).toEqual(['1']);

    // Enrolment needs consent.
    await expect(startEnrollment(student._id, { method: 'menu' })).rejects.toThrow(/consent/);
    await recordConsent({ student, isMinor: true, givenBy: 'parent', giverName: 'Parent', method: 'paper' });
    const started = await startEnrollment(student._id, { method: 'menu' });
    expect(started.pin).toBe('1');
    await enr.drain();
    expect(enr.users.has('1')).toBe(true);

    // Person enrols on the device menu; device uploads FP via OPERLOG.
    const { template } = await enr.enrolOnMenu('1', 0);
    const stored = await BiometricTemplate.findOne({ student: student._id }).lean();
    expect(stored).toMatchObject({ fingerIndex: 0, flag: 1, sourceTerminal: 'ENR1', sourceDialect: 'classic' });
    expect((await Student.findById(student._id).lean()).fingerprintStatus).toBe('enrolled');

    // Fan-out: the gate receives the identical template.
    await gate.drain();
    expect(gate.templates.get('1:0').template).toBe(template);

    // Real-time punch → existing decision pipeline → entry.
    await gate.punch('1');
    let punch = await AttendancePunch.findOne({ terminalSN: 'GATE1', pin: '1' }).lean();
    expect(punch.decision).toMatchObject({ allow: true, action: 'entry' });
    expect(await EntryLog.countDocuments({ sapId: '5001' })).toBe(1);

    // Repeated upload of the same punch is de-duplicated.
    await gate.request('POST', 'cdata?SN=GATE1&table=ATTLOG', `1\t${punch.deviceTimeRaw}\t0\t1\t0`);
    expect(await AttendancePunch.countDocuments({ pin: '1' })).toBe(1);

    // Block: software deny is immediate even though the gate still holds the user.
    await Student.updateOne({ _id: student._id }, { $set: { accessStatus: 'blocked' } });
    await sync.enqueueDelete(student._id, { reason: 'block' });
    await gate.punch('1', new Date(Date.now() + 1000));
    punch = await AttendancePunch.findOne({ terminalSN: 'GATE1', pin: '1', 'decision.reason': 'blocked' }).lean();
    expect(punch.decision.allow).toBe(false);
    expect(await AlertLog.countDocuments({ type: 'security_blocked_on_terminal' })).toBe(1);
    await gate.drain();
    expect(gate.users.has('1')).toBe(false);
    expect(gate.templates.size).toBe(0);

    // GATE2 was offline the whole time: it gets the delete when it polls again
    // (its pending create was superseded by the delete, so it never had the user).
    const gate2 = terminal('GATE2');
    gate2.users.set('1', { name: 'stale copy' });
    await gate2.handshake();
    await gate2.drain();
    expect(gate2.users.has('1')).toBe(false);

    // Unblock: user + template restored without recapture.
    await Student.updateOne({ _id: student._id }, { $set: { accessStatus: 'allowed' } });
    await sync.enqueueRestore(student._id);
    await gate.drain();
    expect(gate.templates.get('1:0').template).toBe(template);

    // Erase: removed from every terminal and from MongoDB.
    await sync.deEnrolAndErase(student._id);
    await gate.drain();
    await enr.drain();
    expect(gate.users.has('1')).toBe(false);
    expect(enr.users.has('1')).toBe(false);
    expect(await BiometricTemplate.countDocuments({})).toBe(0);
    expect(await TerminalCommand.countDocuments({ status: 'failed' })).toBe(0);
  });

  it('backlog punches (history upload) are stored but not run through the live pipeline', async () => {
    const gate = terminal('GATE1');
    await Student.create({ sapId: '5002', name: 'B', zktUserID: 7 });
    await gate.punch('7', new Date(Date.now() - 3 * 24 * 3600 * 1000));
    const punch = await AttendancePunch.findOne({ pin: '7' }).lean();
    expect(punch).toMatchObject({ processed: 'recorded_only' });
    expect(punch.decision.reason).toBe('outside_realtime_window');
    expect(punch.serverReceivedAt).toBeInstanceOf(Date);
    expect(await EntryLog.countDocuments({})).toBe(0);
  });

  it('ignores templates for unknown PINs and templates uploaded without consent', async () => {
    const enr = terminal('ENR1');
    await enr.enrolOnMenu('4242', 0);
    await Student.create({ sapId: '5003', name: 'NoConsent', zktUserID: 8 });
    await enr.enrolOnMenu('8', 0);
    expect(await BiometricTemplate.countDocuments({})).toBe(0);
  });
});
