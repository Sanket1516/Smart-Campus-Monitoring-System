const { mockAllModels, resetModels } = require('../helpers/syncTestEnv');

mockAllModels(jest);

const TerminalConfig = require('../../models/TerminalConfig');
const TerminalCommand = require('../../models/TerminalCommand');
const TerminalUserState = require('../../models/TerminalUserState');
const AlertLog = require('../../models/AlertLog');
const Student = require('../../models/Student');
const queue = require('../../services/sync/commandQueue');
const { storeTemplate } = require('../../services/sync/templateStore');
const { resetSyncConfig } = require('../../config/terminalSync');

const TMP = Buffer.from('a-template-of-some-length').toString('base64');

describe('command queue', () => {
  let terminal;

  beforeEach(async () => {
    resetModels();
    resetSyncConfig();
    delete process.env.ADMS_MAX_COMMANDS_PER_POLL;
    delete process.env.ADMS_STRICT_ORDER;
    terminal = await TerminalConfig.create({ deviceSN: 'SN1', dialect: 'classic' });
  });

  const student = () => Student.create({ sapId: `S${Math.random()}`, name: 'Asha', zktUserID: 1001 });

  it('assigns incrementing per-terminal command ids', async () => {
    const s = await student();
    const a = await queue.enqueueCommand({ terminal, type: 'USER_CREATE', student: s, pin: '1001', params: { pin: '1001', name: 'Asha' } });
    const b = await queue.enqueueCommand({ terminal, type: 'USER_QUERY', student: s, pin: '1001', params: { pin: '1001' } });
    expect([a.command.cmdId, b.command.cmdId]).toEqual([1, 2]);
    expect(a.command.text).toBe('DATA UPDATE USERINFO PIN=1001\tName=Asha\tPri=0\tGrp=1');
  });

  it('is idempotent: no duplicate open command for the same (terminal, student, type)', async () => {
    const s = await student();
    const first = await queue.enqueueCommand({ terminal, type: 'USER_DELETE', student: s, pin: '1001', params: { pin: '1001' } });
    const second = await queue.enqueueCommand({ terminal, type: 'USER_DELETE', student: s, pin: '1001', params: { pin: '1001' } });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(String(second.command._id)).toBe(String(first.command._id));
    expect(await TerminalCommand.countDocuments({ type: 'USER_DELETE' })).toBe(1);
  });

  it('the partial unique index rejects a racing duplicate insert', async () => {
    const s = await student();
    await queue.enqueueCommand({ terminal, type: 'USER_DELETE', student: s, pin: '1001', params: { pin: '1001' } });
    await expect(
      TerminalCommand.create({ terminalSN: 'SN1', cmdId: 99, type: 'USER_DELETE', dialect: 'classic', text: 'x', dedupeKey: 'USER_DELETE', student: s._id })
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('allows a new command once the previous one is closed', async () => {
    const s = await student();
    const first = await queue.enqueueCommand({ terminal, type: 'USER_DELETE', student: s, pin: '1001', params: { pin: '1001' } });
    await queue.takeNextCommands('SN1');
    await queue.applyAck({ terminalSN: 'SN1', id: first.command.cmdId, returnCode: 0 });
    const again = await queue.enqueueCommand({ terminal, type: 'USER_DELETE', student: s, pin: '1001', params: { pin: '1001' } });
    expect(again.created).toBe(true);
  });

  it('sends one command per poll by default and waits for the ack (strict order)', async () => {
    const s = await student();
    await queue.enqueueCommand({ terminal, type: 'USER_CREATE', student: s, pin: '1001', params: { pin: '1001', name: 'A' } });
    await queue.enqueueCommand({ terminal, type: 'USER_QUERY', student: s, pin: '1001', params: { pin: '1001' } });
    const first = await queue.takeNextCommands('SN1');
    expect(first).toHaveLength(1);
    expect(await queue.takeNextCommands('SN1')).toHaveLength(0); // waiting for ack
    await queue.applyAck({ terminalSN: 'SN1', id: first[0].cmdId, returnCode: 0 });
    expect(await queue.takeNextCommands('SN1')).toHaveLength(1);
  });

  it('honours ADMS_MAX_COMMANDS_PER_POLL', async () => {
    process.env.ADMS_MAX_COMMANDS_PER_POLL = '3';
    resetSyncConfig();
    const s = await student();
    for (const type of ['USER_CREATE', 'USER_QUERY', 'TEMPLATE_QUERY', 'USER_QUERY_ALL']) {
      await queue.enqueueCommand({ terminal, type, student: s, pin: '1001', params: { pin: '1001', name: 'A' } });
    }
    expect(await queue.takeNextCommands('SN1')).toHaveLength(3);
  });

  it('orders deletes before creates (priority) and user before template', async () => {
    const a = await student();
    const b = await Student.create({ sapId: 'S-b', name: 'B', zktUserID: 1002 });
    const stored = await storeTemplate({ student: b, pin: '1002', fingerIndex: 0, template: TMP, sourceTerminal: 'ENR' });
    await queue.enqueueCommand({ terminal, type: 'USER_CREATE', student: b, pin: '1002', params: { pin: '1002', name: 'B' } });
    await queue.enqueueCommand({
      terminal,
      type: 'TEMPLATE_WRITE',
      student: b,
      pin: '1002',
      params: { pin: '1002', fingerIndex: 0, flag: 1, sha256: stored.template.sha256 },
      templateRef: stored.template._id,
      dedupeSuffix: '0',
    });
    await queue.enqueueCommand({ terminal, type: 'USER_DELETE', student: a, pin: '1001', params: { pin: '1001' } });
    const sent = await queue.takeNextCommands('SN1', { max: 10, strictOrder: false });
    expect(sent.map((c) => c.type)).toEqual(['USER_DELETE', 'USER_CREATE', 'TEMPLATE_WRITE']);
  });

  it('never stores the template in the queue; renders it only at send time', async () => {
    const s = await student();
    const stored = await storeTemplate({ student: s, pin: '1001', fingerIndex: 1, template: TMP, sourceTerminal: 'ENR' });
    const { command } = await queue.enqueueCommand({
      terminal,
      type: 'TEMPLATE_WRITE',
      student: s,
      pin: '1001',
      params: { pin: '1001', fingerIndex: 1, flag: 1, sha256: stored.template.sha256 },
      templateRef: stored.template._id,
      dedupeSuffix: '1',
    });
    expect(command.text).not.toContain(TMP);
    expect(command.text).toMatch(/TMP=<redacted sha256:[0-9a-f]{12}>$/);
    const [sent] = await queue.takeNextCommands('SN1');
    const size = Buffer.from(TMP, 'base64').length;
    expect(sent.text).toBe(`DATA UPDATE FINGERTMP PIN=1001\tFID=1\tSize=${size}\tValid=1\tTMP=${TMP}`);
    const raw = JSON.stringify(TerminalCommand._store());
    expect(raw).not.toContain(TMP);
  });

  it('acks update TerminalUserState; delete-missing (-1) counts as success', async () => {
    const s = await student();
    const create = await queue.enqueueCommand({ terminal, type: 'USER_CREATE', student: s, pin: '1001', params: { pin: '1001', name: 'A' } });
    await queue.takeNextCommands('SN1');
    await queue.applyAck({ terminalSN: 'SN1', id: create.command.cmdId, returnCode: 0 });
    expect(await TerminalUserState.findOne({ terminalSN: 'SN1', pin: '1001' }).lean()).toMatchObject({ present: true, source: 'ack' });

    const del = await queue.enqueueCommand({ terminal, type: 'USER_DELETE', student: s, pin: '1001', params: { pin: '1001' } });
    await queue.takeNextCommands('SN1');
    const result = await queue.applyAck({ terminalSN: 'SN1', id: del.command.cmdId, returnCode: -1 });
    expect(result.success).toBe(true);
    expect(await TerminalUserState.findOne({ terminalSN: 'SN1', pin: '1001' }).lean()).toMatchObject({ present: false });
  });

  it('ignores duplicate acks and unknown command ids', async () => {
    const s = await student();
    const { command } = await queue.enqueueCommand({ terminal, type: 'USER_CREATE', student: s, pin: '1001', params: { pin: '1001', name: 'A' } });
    await queue.takeNextCommands('SN1');
    await queue.applyAck({ terminalSN: 'SN1', id: command.cmdId, returnCode: 0 });
    expect((await queue.applyAck({ terminalSN: 'SN1', id: command.cmdId, returnCode: 0 })).duplicate).toBe(true);
    expect((await queue.applyAck({ terminalSN: 'SN1', id: 999, returnCode: 0 })).unknown).toBe(true);
  });

  it('marks error return codes failed and raises one alert', async () => {
    const s = await student();
    const { command } = await queue.enqueueCommand({ terminal, type: 'USER_CREATE', student: s, pin: '1001', params: { pin: '1001', name: 'A' } });
    await queue.takeNextCommands('SN1');
    await queue.applyAck({ terminalSN: 'SN1', id: command.cmdId, returnCode: -1002 });
    const saved = await TerminalCommand.findById(command._id).lean();
    expect(saved).toMatchObject({ status: 'failed', open: false, returnCode: -1002 });
    expect(saved.lastError).toMatch(/bad syntax/);
    expect(await AlertLog.countDocuments({ type: 'sync_failed' })).toBe(1);
  });

  it('resends after the ack timeout and fails after max attempts', async () => {
    const s = await student();
    const { command } = await queue.enqueueCommand({ terminal, type: 'USER_DELETE', student: s, pin: '1001', params: { pin: '1001' } });
    let now = new Date('2026-10-31T00:00:00Z');
    const later = () => {
      now = new Date(now.getTime() + 11 * 60 * 1000);
      return now;
    };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const sent = await queue.takeNextCommands('SN1', { now });
      expect(sent).toHaveLength(1);
      expect(sent[0].cmdId).toBe(command.cmdId); // same id on resend
      const sweep = await queue.sweepTimeouts(later());
      expect(sweep).toEqual(attempt < 3 ? { requeued: 1, failed: 0 } : { requeued: 0, failed: 1 });
    }
    const saved = await TerminalCommand.findById(command._id).lean();
    expect(saved).toMatchObject({ status: 'failed', attempts: 3, open: false });
    expect(await AlertLog.countDocuments({ type: 'sync_failed' })).toBe(1);
  });

  it('retryFailedCommands re-opens failed commands but not superseded ones', async () => {
    const s = await student();
    const { command } = await queue.enqueueCommand({ terminal, type: 'USER_DELETE', student: s, pin: '1001', params: { pin: '1001' } });
    await queue.takeNextCommands('SN1');
    await queue.applyAck({ terminalSN: 'SN1', id: command.cmdId, returnCode: -2 });
    expect(await queue.retryFailedCommands({ terminalSN: 'SN1' })).toEqual({ retried: 1, skipped: 0 });
    expect((await TerminalCommand.findById(command._id).lean()).status).toBe('pending');

    // fail again, then a newer equivalent command is queued: retry must skip
    await queue.takeNextCommands('SN1');
    await queue.applyAck({ terminalSN: 'SN1', id: command.cmdId, returnCode: -2 });
    await queue.enqueueCommand({ terminal, type: 'USER_DELETE', student: s, pin: '1001', params: { pin: '1001' } });
    expect(await queue.retryFailedCommands({ terminalSN: 'SN1' })).toEqual({ retried: 0, skipped: 1 });
  });

  it('survives a "restart": state lives only in the store', async () => {
    const s = await student();
    await queue.enqueueCommand({ terminal, type: 'USER_DELETE', student: s, pin: '1001', params: { pin: '1001' } });
    // Simulate a process restart: new module instances, only persisted documents survive.
    const persisted = { cmds: [...TerminalCommand._store()], terms: [...TerminalConfig._store()] };
    jest.resetModules();
    // Documents come back from "disk": re-create ObjectIds with the reloaded mongoose.
    const { Types } = require('mongoose');
    const revive = (doc) => {
      const out = JSON.parse(JSON.stringify(doc));
      ['_id', 'student', 'templateRef'].forEach((key) => {
        if (out[key]) out[key] = new Types.ObjectId(out[key]);
      });
      return out;
    };
    require('../../models/TerminalCommand')._store().push(...persisted.cmds.map(revive));
    require('../../models/TerminalConfig')._store().push(...persisted.terms.map(revive));
    const fresh = require('../../services/sync/commandQueue');
    const sent = await fresh.takeNextCommands('SN1');
    expect(sent.map((c) => c.text)).toEqual(['DATA DELETE USERINFO PIN=1001']);
  });
});
