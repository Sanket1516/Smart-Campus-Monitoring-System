// End-to-end /iclock tests: the real Express app and an in-memory MongoDB, driven by
// the fake terminal. They prove the server logic, not X990 behaviour.
const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.BIOMETRIC_KEY = crypto.randomBytes(32).toString('hex');
process.env.ADMS_ALLOWED_CIDRS = '';

jest.mock('../services/notification', () => ({ notifyParent: jest.fn().mockResolvedValue() }));

const app = require('../server');
const Student = require('../models/Student');
const TerminalConfig = require('../models/TerminalConfig');
const TerminalCommand = require('../models/TerminalCommand');
const TerminalUserState = require('../models/TerminalUserState');
const BiometricTemplate = require('../models/BiometricTemplate');
const ConsentRecord = require('../models/ConsentRecord');
const PushAttendanceEvent = require('../models/PushAttendanceEvent');
const EntryLog = require('../models/EntryLog');
const AlertLog = require('../models/AlertLog');
const { enqueueCommand } = require('../services/commandQueueService');
const { sha256Hex } = require('../services/templateCrypto');
const syncEvents = require('../services/syncEvents');
const { FakeTerminal } = require('../tools/fake-terminal');

jest.setTimeout(120000);

let mongo;
let server;
let baseUrl;

const createTerminals = async () => {
  const enrollment = await TerminalConfig.create({
    machineNumber: 50,
    deviceSN: 'ENROLL01',
    gateName: 'Admin Office',
    terminalLabel: 'Enrollment Station',
  });
  const gate = await TerminalConfig.create({
    machineNumber: 101,
    deviceSN: 'GATE0001',
    gateName: 'Main Gate',
    terminalLabel: 'Main Gate Terminal 1',
    terminalType: 'MAIN_GATE',
  });
  return { enrollment, gate };
};

const createStudent = async (overrides = {}) => {
  const student = await Student.create({
    sapId: `SAP${Math.floor(Math.random() * 1e9)}`,
    name: 'Asha K',
    email: 'asha@example.edu',
    category: 'dayscholars',
    course: 'engineering',
    department: 'computer science',
    zktUserID: 5,
    ...overrides,
  });
  return student;
};

const giveConsent = async (student) => {
  const consent = await ConsentRecord.create({
    student: student._id,
    consentType: 'self',
    givenByName: student.name,
    method: 'paper_form',
  });
  student.consentRef = consent._id;
  await student.save();
};

const classicTerminal = async (sn) => {
  await TerminalConfig.updateOne({ deviceSN: sn }, { $set: { dialect: 'classic' } });
  return new FakeTerminal({ baseUrl, sn });
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all(
    [TerminalConfig, TerminalCommand, TerminalUserState, BiometricTemplate, PushAttendanceEvent, Student].map((m) => m.init())
  );
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  process.env.ADMS_ALLOWED_CIDRS = '';
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

describe('guard', () => {
  it('refuses unregistered serial numbers and raises one security alert', async () => {
    const terminal = new FakeTerminal({ baseUrl, sn: 'UNKNOWN9' });

    expect((await terminal.handshake()).status).toBe(403);
    expect((await terminal.poll()).length).toBe(0);
    expect(await AlertLog.countDocuments({ type: 'security' })).toBe(1);
  });

  it('refuses sources outside ADMS_ALLOWED_CIDRS', async () => {
    await createTerminals();
    process.env.ADMS_ALLOWED_CIDRS = '10.0.0.0/8';

    expect((await new FakeTerminal({ baseUrl, sn: 'GATE0001' }).handshake()).status).toBe(403);
  });

  it('refuses disabled terminals', async () => {
    await createTerminals();
    await TerminalConfig.updateOne({ deviceSN: 'GATE0001' }, { $set: { enabled: false } });

    expect((await new FakeTerminal({ baseUrl, sn: 'GATE0001' }).handshake()).status).toBe(403);
  });
});

describe('handshake and dialect detection', () => {
  it('returns the option block and records the push version', async () => {
    await createTerminals();
    const terminal = new FakeTerminal({ baseUrl, sn: 'GATE0001', pushver: '2.4.1' });

    const { status, text } = await terminal.handshake();

    expect(status).toBe(200);
    expect(text.split('\n')).toEqual([
      'GET OPTION FROM: GATE0001',
      'ATTLOGStamp=0',
      'OPERLOGStamp=0',
      'ATTPHOTOStamp=0',
      'ErrorDelay=60',
      'Delay=10',
      'TransTimes=00:00;23:59',
      'TransInterval=1',
      'TransFlag=1111000000',
      'TimeZone=+05:30',
      'Timeout=60',
      'SyncTime=3600',
      'Realtime=1',
      'Encrypt=0',
      'ServerVer=3.4.1 2010-06-07',
      '',
    ]);
    expect((await TerminalConfig.findOne({ deviceSN: 'GATE0001' })).pushVersion).toBe('2.4.1');
  });

  it('detects a classic terminal from probe acks and then sends held work', async () => {
    await createTerminals();
    const student = await createStudent();
    await enqueueCommand({ terminalSN: 'GATE0001', type: 'createUser', student, params: { pin: '5', name: 'Asha K' } });
    const terminal = new FakeTerminal({ baseUrl, sn: 'GATE0001', dialect: 'classic' });

    await terminal.handshake();
    const firstPoll = await terminal.poll();
    expect(firstPoll.map((ack) => ack.command)).toEqual(['DATA QUERY USERINFO PIN=1']);
    await terminal.poll();

    const stored = await TerminalConfig.findOne({ deviceSN: 'GATE0001' });
    expect(stored.dialect).toBe('classic');
    expect(stored.firmware).toBe('Ver 6.60 Fake');

    await terminal.poll();
    expect(terminal.users.get('5')).toMatchObject({ PIN: '5', Name: 'Asha K' });
    expect((await TerminalUserState.findOne({ student: student._id, terminalSN: 'GATE0001' })).present).toBe(true);
  });

  it('detects a v3 terminal', async () => {
    await createTerminals();
    const terminal = new FakeTerminal({ baseUrl, sn: 'GATE0001', dialect: 'v3' });

    await terminal.handshake();
    await terminal.poll();
    await terminal.poll();

    expect((await TerminalConfig.findOne({ deviceSN: 'GATE0001' })).dialect).toBe('v3');
  });
});

describe('ATTLOG', () => {
  it('feeds punches into the scan pipeline and drops repeats', async () => {
    await createTerminals();
    const student = await createStudent();
    const terminal = await classicTerminal('GATE0001');
    const time = new Date();

    await terminal.punch('5', { time });
    await terminal.punch('5', { time });

    const events = await PushAttendanceEvent.find().lean();
    expect(events).toHaveLength(1);
    expect(events[0].result).toEqual({ allow: true, reason: 'allowed' });
    expect(events[0].serverReceivedAt).toBeInstanceOf(Date);
    expect(await EntryLog.countDocuments({ sapId: student.sapId, status: 'entered' })).toBe(1);
  });

  it('denies a blocked student in software and re-queues the delete for that terminal', async () => {
    await createTerminals();
    const student = await createStudent({ accessStatus: 'blocked', blockReason: 'Fees' });
    const terminal = await classicTerminal('GATE0001');
    terminal.users.set('5', { PIN: '5', Name: 'Asha K' });

    await terminal.punch('5');

    expect((await PushAttendanceEvent.findOne()).result.reason).toBe('blocked');
    expect(await EntryLog.countDocuments()).toBe(0);
    expect(await AlertLog.countDocuments({ type: 'security' })).toBe(1);

    await terminal.poll();
    expect(terminal.users.has('5')).toBe(false);
    expect((await TerminalUserState.findOne({ student: student._id })).present).toBe(false);
  });

  it('logs an unknown PIN as unauthorized', async () => {
    await createTerminals();
    const terminal = await classicTerminal('GATE0001');

    await terminal.punch('777');

    expect((await PushAttendanceEvent.findOne()).result.reason).toBe('unknown_student');
  });
});

describe('template uploads', () => {
  it('stores an enrollment-station template encrypted and marks the student enrolled', async () => {
    await createTerminals();
    const student = await createStudent();
    await giveConsent(student);
    const terminal = await classicTerminal('ENROLL01');
    const stored = jest.fn();
    syncEvents.once('templateStored', stored);

    const { bytes, tmp } = await terminal.uploadTemplate('5', 6);

    const template = await BiometricTemplate.findOne({ student: student._id }).select('+dataEncrypted').lean();
    expect(template).toMatchObject({ fingerIndex: 6, flag: 1, sizeReported: tmp.length, byteLength: bytes.length });
    expect(template.sha256).toBe(sha256Hex(bytes));
    expect(Buffer.from(template.dataEncrypted.ct.buffer).equals(bytes)).toBe(false);
    expect((await Student.findById(student._id)).fingerprintStatus).toBe('enrolled');
    expect(stored).toHaveBeenCalledWith({ studentId: String(student._id), terminalSN: 'ENROLL01', fingerIndex: 6 });
  });

  it('refuses a template when no consent is recorded', async () => {
    await createTerminals();
    const student = await createStudent();
    const terminal = await classicTerminal('ENROLL01');

    await terminal.uploadTemplate('5', 6);

    expect(await BiometricTemplate.countDocuments()).toBe(0);
    expect((await Student.findById(student._id)).fingerprintStatus).toBe('none');
    expect(await AlertLog.countDocuments({ type: 'security' })).toBe(1);
  });

  it('does not store templates uploaded by a gate terminal, only presence', async () => {
    await createTerminals();
    const student = await createStudent();
    await giveConsent(student);
    const terminal = await classicTerminal('GATE0001');

    await terminal.uploadTemplate('5', 2);

    expect(await BiometricTemplate.countDocuments()).toBe(0);
    expect((await TerminalUserState.findOne({ student: student._id })).fingerIndexes).toEqual([2]);
  });

  it('copies a stored template to a gate exactly as uploaded', async () => {
    await createTerminals();
    const student = await createStudent();
    await giveConsent(student);
    const enrollment = await classicTerminal('ENROLL01');
    const { tmp } = await enrollment.uploadTemplate('5', 6);
    const template = await BiometricTemplate.findOne({ student: student._id });
    const gate = await classicTerminal('GATE0001');

    await enqueueCommand({ terminalSN: 'GATE0001', type: 'createUser', student, params: { pin: '5', name: 'Asha K' } });
    await enqueueCommand({
      terminalSN: 'GATE0001',
      type: 'writeTemplate',
      student,
      params: { pin: '5', fingerIndex: 6, templateId: template._id },
    });
    await gate.poll();
    await gate.poll();

    expect(gate.templates.get('5:6')).toEqual({ PIN: '5', FID: '6', Size: String(tmp.length), Valid: '1', TMP: tmp });
    expect((await TerminalUserState.findOne({ student: student._id, terminalSN: 'GATE0001' })).fingerIndexes).toEqual([6]);
  });
});
