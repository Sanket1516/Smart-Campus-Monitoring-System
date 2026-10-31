const crypto = require('crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.BIOMETRIC_KEY = crypto.randomBytes(32).toString('hex');

const TerminalConfig = require('../models/TerminalConfig');
const TerminalCommand = require('../models/TerminalCommand');
const TerminalUserState = require('../models/TerminalUserState');
const BiometricTemplate = require('../models/BiometricTemplate');
const BiometricAuditLog = require('../models/BiometricAuditLog');
const AlertLog = require('../models/AlertLog');
const { encryptTemplate, sha256Hex } = require('../services/templateCrypto');
const {
  claimNextCommands,
  enqueueCommand,
  enqueueDialectProbes,
  formatPollResponse,
  recordAck,
  requeueTimedOut,
  retryFailedCommands,
  templateAad,
} = require('../services/commandQueueService');

jest.setTimeout(120000);

let mongo;
const SN = 'TEST0001';
const studentId = () => new mongoose.Types.ObjectId();

const createTerminal = (overrides = {}) =>
  TerminalConfig.create({
    machineNumber: 101,
    deviceSN: SN,
    gateName: 'Main Gate',
    terminalLabel: 'Main Gate Terminal 1',
    ...overrides,
  });

const storeTemplate = async (student, fingerIndex, bytes, sizeReported = null) =>
  BiometricTemplate.create({
    student,
    fingerIndex,
    flag: 1,
    sizeReported,
    byteLength: bytes.length,
    sha256: sha256Hex(bytes),
    dataEncrypted: encryptTemplate(bytes, templateAad(student, fingerIndex)),
    sourceFormat: 'adms_base64',
    sourceTerminal: 'ENROLL01',
  });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([TerminalConfig, TerminalCommand, TerminalUserState, BiometricTemplate].map((m) => m.init()));
});

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('enqueueCommand', () => {
  it('is idempotent for the same terminal, student and type', async () => {
    await createTerminal();
    const student = studentId();

    const first = await enqueueCommand({ terminalSN: SN, type: 'createUser', student, params: { pin: '5', name: 'A' } });
    const second = await enqueueCommand({ terminalSN: SN, type: 'createUser', student, params: { pin: '5', name: 'B' } });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(await TerminalCommand.countDocuments()).toBe(1);
    // The pending command keeps the latest arguments.
    expect((await TerminalCommand.findOne()).params.name).toBe('B');
  });

  it('allows only one open command under concurrent enqueues', async () => {
    await createTerminal();
    const student = studentId();

    await Promise.all(
      Array.from({ length: 10 }, () =>
        enqueueCommand({ terminalSN: SN, type: 'deleteUser', student, params: { pin: '5' } })
      )
    );

    expect(await TerminalCommand.countDocuments({ open: true })).toBe(1);
  });

  it('gives each terminal its own incrementing cmdId', async () => {
    await createTerminal();
    await createTerminal({ machineNumber: 102, deviceSN: 'TEST0002', terminalLabel: 'T2' });

    const a = await enqueueCommand({ terminalSN: SN, type: 'createUser', student: studentId(), params: { pin: '1' } });
    const b = await enqueueCommand({ terminalSN: SN, type: 'createUser', student: studentId(), params: { pin: '2' } });
    const c = await enqueueCommand({ terminalSN: 'TEST0002', type: 'createUser', student: studentId(), params: { pin: '1' } });

    expect([a.command.cmdId, b.command.cmdId, c.command.cmdId]).toEqual([1, 2, 1]);
  });

  it('refuses unregistered terminals', async () => {
    await expect(
      enqueueCommand({ terminalSN: 'NOPE', type: 'createUser', student: studentId(), params: { pin: '1' } })
    ).rejects.toThrow('not registered');
  });

  it('a delete supersedes pending create and template commands', async () => {
    await createTerminal({ dialect: 'classic' });
    const student = studentId();

    await enqueueCommand({ terminalSN: SN, type: 'createUser', student, params: { pin: '5', name: 'A' } });
    await enqueueCommand({ terminalSN: SN, type: 'writeTemplate', student, params: { pin: '5', fingerIndex: 0 } });
    await enqueueCommand({ terminalSN: SN, type: 'deleteUser', student, params: { pin: '5' } });

    expect(await TerminalCommand.countDocuments({ status: 'superseded' })).toBe(2);
    expect(await TerminalCommand.countDocuments({ status: 'pending', type: 'deleteUser' })).toBe(1);
  });

  it('a new command is allowed once the previous one is settled', async () => {
    const terminal = await createTerminal({ dialect: 'classic' });
    const student = studentId();

    await enqueueCommand({ terminalSN: SN, type: 'createUser', student, params: { pin: '5', name: 'A' } });
    const [sent] = await claimNextCommands(terminal);
    await recordAck({ terminalSN: SN, cmdId: sent.cmdId, returnCode: 0 });
    const again = await enqueueCommand({ terminalSN: SN, type: 'createUser', student, params: { pin: '5', name: 'A' } });

    expect(again.created).toBe(true);
  });
});

describe('claimNextCommands', () => {
  it('holds normal commands until the dialect is known, but sends probes', async () => {
    const terminal = await createTerminal();
    await enqueueCommand({ terminalSN: SN, type: 'createUser', student: studentId(), params: { pin: '5', name: 'A' } });
    await enqueueDialectProbes(terminal);

    const claimed = await claimNextCommands(terminal, { limit: 5 });

    expect(claimed.map((c) => c.text).sort()).toEqual([
      'DATA QUERY USERINFO PIN=1',
      'DATA QUERY tablename=user,fielddesc=*,filter=Pin=1',
    ]);
    expect(await TerminalCommand.countDocuments({ type: 'createUser', status: 'pending' })).toBe(1);
  });

  it('detects the classic dialect from probe acks, then sends queued work', async () => {
    let terminal = await createTerminal();
    await enqueueCommand({ terminalSN: SN, type: 'createUser', student: studentId(), params: { pin: '5', name: 'A' } });
    await enqueueDialectProbes(terminal);
    const probes = await TerminalCommand.find({ type: 'probe' });
    const classicProbe = probes.find((p) => p.params.dialect === 'classic');
    const v3Probe = probes.find((p) => p.params.dialect === 'v3');

    await claimNextCommands(terminal, { limit: 5 });
    await recordAck({ terminalSN: SN, cmdId: classicProbe.cmdId, returnCode: 0 });
    const result = await recordAck({ terminalSN: SN, cmdId: v3Probe.cmdId, returnCode: -1004 });

    expect(result.dialect).toBe('classic');
    terminal = await TerminalConfig.findOne({ deviceSN: SN });
    expect(terminal.dialect).toBe('classic');

    const [next] = await claimNextCommands(terminal);
    expect(next.text).toBe('DATA UPDATE USERINFO PIN=5\tName=A\tPri=0\tPasswd=\tCard=\tGrp=\tTZ=');
  });

  it('orders deletes first and a user before its template', async () => {
    const terminal = await createTerminal({ dialect: 'classic' });
    const studentA = studentId();
    const studentB = studentId();
    const bytes = Buffer.from('fake template bytes');
    const template = await storeTemplate(studentA, 6, bytes);

    await enqueueCommand({ terminalSN: SN, type: 'writeTemplate', student: studentA, params: { pin: '5', fingerIndex: 6, templateId: template._id } });
    await enqueueCommand({ terminalSN: SN, type: 'createUser', student: studentA, params: { pin: '5', name: 'A' } });
    await enqueueCommand({ terminalSN: SN, type: 'deleteUser', student: studentB, params: { pin: '9' } });

    const claimed = await claimNextCommands(terminal, { limit: 3 });

    expect(claimed.map((c) => c.text.split(' ').slice(0, 3).join(' '))).toEqual([
      'DATA DELETE USERINFO',
      'DATA UPDATE USERINFO',
      'DATA UPDATE FINGERTMP',
    ]);
  });

  it('respects the per-poll limit and never sends a command twice', async () => {
    const terminal = await createTerminal({ dialect: 'classic' });
    for (let pin = 1; pin <= 3; pin += 1) {
      await enqueueCommand({ terminalSN: SN, type: 'createUser', student: studentId(), params: { pin: String(pin), name: 'X' } });
    }

    const [pollA, pollB] = await Promise.all([claimNextCommands(terminal), claimNextCommands(terminal)]);
    const sentIds = [...pollA, ...pollB].map((c) => c.cmdId);

    expect(pollA.length).toBeLessThanOrEqual(1);
    expect(new Set(sentIds).size).toBe(sentIds.length);
  });

  it('renders the stored template exactly and keeps it out of the database text', async () => {
    const terminal = await createTerminal({ dialect: 'classic' });
    const student = studentId();
    const bytes = crypto.randomBytes(900);
    const template = await storeTemplate(student, 2, bytes, 1200);

    await enqueueCommand({ terminalSN: SN, type: 'writeTemplate', student, params: { pin: '5', fingerIndex: 2, templateId: template._id } });
    const [sent] = await claimNextCommands(terminal);
    const stored = await TerminalCommand.findOne({ type: 'writeTemplate' }).lean();

    expect(sent.text).toBe(`DATA UPDATE FINGERTMP PIN=5\tFID=2\tSize=1200\tValid=1\tTMP=${bytes.toString('base64')}`);
    expect(JSON.stringify(stored)).not.toContain(bytes.toString('base64'));
    expect(stored.textRedacted).toContain(`<redacted sha256:${sha256Hex(bytes)}>`);
  });

  it('fails a template write whose template was erased', async () => {
    const terminal = await createTerminal({ dialect: 'classic' });
    await enqueueCommand({
      terminalSN: SN,
      type: 'writeTemplate',
      student: studentId(),
      params: { pin: '5', fingerIndex: 0, templateId: new mongoose.Types.ObjectId() },
    });

    expect(await claimNextCommands(terminal)).toEqual([]);
    expect((await TerminalCommand.findOne()).status).toBe('failed');
    expect(await AlertLog.countDocuments({ type: 'sync_failed' })).toBe(1);
  });

  it('formats a poll reply as C:<id>:<command> lines or OK', () => {
    expect(formatPollResponse([])).toBe('OK');
    expect(formatPollResponse([{ cmdId: 3, text: 'DATA DELETE USERINFO PIN=5' }])).toBe('C:3:DATA DELETE USERINFO PIN=5');
  });
});

describe('recordAck', () => {
  const sendOne = async (type, params, student = studentId()) => {
    const terminal = await createTerminal({ dialect: 'classic' });
    await enqueueCommand({ terminalSN: SN, type, student, params });
    const [sent] = await claimNextCommands(terminal);
    return { sent, student };
  };

  it('marks a successful create as acked and records the user as present', async () => {
    const { sent, student } = await sendOne('createUser', { pin: '5', name: 'A' });

    const result = await recordAck({ terminalSN: SN, cmdId: sent.cmdId, returnCode: 0 });

    expect(result.outcome).toBe('acked');
    expect((await TerminalUserState.findOne({ student })).present).toBe(true);
    expect(await BiometricAuditLog.countDocuments({ action: 'user_create', result: 'success' })).toBe(1);
  });

  it('ignores a duplicate ack', async () => {
    const { sent } = await sendOne('createUser', { pin: '5', name: 'A' });
    await recordAck({ terminalSN: SN, cmdId: sent.cmdId, returnCode: 0 });

    const duplicate = await recordAck({ terminalSN: SN, cmdId: sent.cmdId, returnCode: -2 });

    expect(duplicate.duplicate).toBe(true);
    expect((await TerminalCommand.findOne()).status).toBe('acked');
  });

  it('treats deleting an absent user as success', async () => {
    const { sent, student } = await sendOne('deleteUser', { pin: '5' });

    const result = await recordAck({ terminalSN: SN, cmdId: sent.cmdId, returnCode: -1 });

    expect(result.outcome).toBe('acked');
    expect((await TerminalUserState.findOne({ student })).present).toBe(false);
  });

  it('fails without retry on bad syntax and raises an alert', async () => {
    const { sent } = await sendOne('createUser', { pin: '5', name: 'A' });

    const result = await recordAck({ terminalSN: SN, cmdId: sent.cmdId, returnCode: -1002 });

    expect(result.outcome).toBe('failed');
    expect(await AlertLog.countDocuments({ type: 'sync_failed' })).toBe(1);
  });

  it('retries a transient error', async () => {
    const { sent } = await sendOne('createUser', { pin: '5', name: 'A' });

    const result = await recordAck({ terminalSN: SN, cmdId: sent.cmdId, returnCode: -2 });

    expect(result.outcome).toBe('pending');
  });

  it('reports an unknown cmdId as unmatched', async () => {
    await createTerminal();
    expect((await recordAck({ terminalSN: SN, cmdId: 999, returnCode: 0 })).matched).toBe(false);
  });
});

describe('timeouts and retries', () => {
  it('resends after the ack timeout and fails after the maximum attempts', async () => {
    const terminal = await createTerminal({ dialect: 'classic' });
    await enqueueCommand({ terminalSN: SN, type: 'createUser', student: studentId(), params: { pin: '5', name: 'A' } });
    let clock = Date.now();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const claimed = await claimNextCommands(terminal, { now: new Date(clock) });
      expect(claimed).toHaveLength(1);
      clock += 11 * 60 * 1000;
      await requeueTimedOut({ now: new Date(clock) });
    }

    const command = await TerminalCommand.findOne();
    expect(command.status).toBe('failed');
    expect(command.attempts).toBe(3);
    expect(await AlertLog.countDocuments({ type: 'sync_failed' })).toBe(1);
  });

  it('does not resend before the timeout', async () => {
    const terminal = await createTerminal({ dialect: 'classic' });
    await enqueueCommand({ terminalSN: SN, type: 'createUser', student: studentId(), params: { pin: '5', name: 'A' } });
    const now = new Date();
    await claimNextCommands(terminal, { now });

    expect(await requeueTimedOut({ now: new Date(now.getTime() + 5 * 60 * 1000) })).toEqual({ requeued: 0, failed: 0 });
  });

  it('lets an admin retry failed commands', async () => {
    const terminal = await createTerminal({ dialect: 'classic' });
    await enqueueCommand({ terminalSN: SN, type: 'createUser', student: studentId(), params: { pin: '5', name: 'A' } });
    const [sent] = await claimNextCommands(terminal);
    await recordAck({ terminalSN: SN, cmdId: sent.cmdId, returnCode: -1002 });

    expect(await retryFailedCommands({ terminalSN: SN })).toEqual({ retried: 1 });
    expect((await TerminalCommand.findOne()).status).toBe('pending');
  });
});
