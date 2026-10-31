const { mockAllModels, resetModels } = require('../helpers/syncTestEnv');

mockAllModels(jest);

const TerminalConfig = require('../../models/TerminalConfig');
const TerminalCommand = require('../../models/TerminalCommand');
const ReconciliationReport = require('../../models/ReconciliationReport');
const AlertLog = require('../../models/AlertLog');
const Student = require('../../models/Student');
const { diffTerminal, runReconciliation } = require('../../services/sync/reconciliation');
const { resetSyncConfig } = require('../../config/terminalSync');
const { resetPinAllocatorForTests } = require('../../services/sync/pinAllocator');
const { setSidecarForTests } = require('../../services/sidecar');
const { createFakeSidecar } = require('../../services/sidecar/fakeSidecar');

describe('reconciliation diff', () => {
  it('classifies missing, extra, blocked and unknown PINs', () => {
    const pinIndex = new Map([
      ['1', { blocked: false }],
      ['2', { blocked: false }],
      ['3', { blocked: true }],
      ['4', { blocked: false }],
    ]);
    const diff = diffTerminal({
      desiredPins: new Set(['1', '2']),
      actualPins: new Set(['2', '3', '4', '900']),
      pinIndex,
    });
    expect(diff).toEqual({ missing: ['1'], extra: ['4'], blockedPresent: ['3'], unknownPins: ['900'] });
  });

  it('reports nothing when in sync', () => {
    const diff = diffTerminal({ desiredPins: new Set(['1']), actualPins: new Set(['1']), pinIndex: new Map([['1', { blocked: false }]]) });
    expect(diff).toEqual({ missing: [], extra: [], blockedPresent: [], unknownPins: [] });
  });
});

describe('runReconciliation (sidecar source)', () => {
  let sidecar;

  beforeEach(async () => {
    resetModels();
    resetSyncConfig();
    resetPinAllocatorForTests();
    sidecar = createFakeSidecar();
    setSidecarForTests(sidecar);
    await TerminalConfig.create({ deviceSN: 'GATE1', terminalType: 'MAIN_GATE', terminalIP: '10.0.0.1' });
  });

  it('queues fixes, deletes blocked students found on a terminal and raises a security alert', async () => {
    const ok = await Student.create({ sapId: 'A', name: 'Ok', zktUserID: 1 });
    await Student.create({ sapId: 'B', name: 'Missing', zktUserID: 2 });
    await Student.create({ sapId: 'C', name: 'Blocked', zktUserID: 3, accessStatus: 'blocked' });
    await Student.create({ sapId: 'D', name: 'Never provisioned' });
    await sidecar.upsertUser('10.0.0.1', { user_id: '1', name: ok.name });
    await sidecar.upsertUser('10.0.0.1', { user_id: '3', name: 'Blocked' });
    await sidecar.upsertUser('10.0.0.1', { user_id: '555', name: 'Staff' });

    const summary = await runReconciliation({ source: 'sidecar' });
    expect(summary).toMatchObject({ terminals: 1, drift: 1, blockedPresent: 1, unprovisioned: 1 });
    const report = await ReconciliationReport.findOne({ terminalSN: 'GATE1' }).lean();
    expect(report).toMatchObject({ status: 'drift', missing: ['2', '4'].filter((p) => p === '2'), blockedPresent: ['3'], unknownPins: ['555'] });
    expect(await TerminalCommand.countDocuments({ terminalSN: 'GATE1', type: 'USER_DELETE', pin: '3', open: true })).toBe(1);
    expect(await TerminalCommand.countDocuments({ terminalSN: 'GATE1', type: 'USER_CREATE', pin: '2', open: true })).toBe(1);
    expect(await TerminalCommand.countDocuments({ type: 'USER_DELETE', pin: '555' })).toBe(0); // unknown PINs reported only
    expect(await AlertLog.countDocuments({ type: 'security_blocked_on_terminal' })).toBe(1);
  });

  it('records an error report when a terminal is unreachable', async () => {
    sidecar.setOffline('10.0.0.1', true);
    const summary = await runReconciliation({ source: 'sidecar' });
    expect(summary.errors).toBe(1);
    expect((await ReconciliationReport.findOne({}).lean()).error).toMatch(/unreachable/);
  });

  it('a second run is idempotent (no duplicate fix commands)', async () => {
    await Student.create({ sapId: 'B', name: 'Missing', zktUserID: 2 });
    await runReconciliation({ source: 'sidecar' });
    await runReconciliation({ source: 'sidecar' });
    expect(await TerminalCommand.countDocuments({ pin: '2', open: true })).toBe(1);
  });
});
