/** POST /api/fingerprint/scan must keep working after the scan pipeline was extracted. */
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
const request = require('supertest');
const TerminalConfig = require('../../models/TerminalConfig');
const Student = require('../../models/Student');
const configService = require('../../services/configService');
const fingerprintRoutes = require('../../routes/fingerprint');

const app = express();
app.use(express.json());
app.use('/api/fingerprint', fingerprintRoutes);

describe('POST /api/fingerprint/scan (regression)', () => {
  beforeEach(async () => {
    resetModels();
    ['EntryLog', 'UnauthorizedLog', 'HostellerRequest', 'AccessControlLog'].forEach((name) => require(`../../models/${name}`)._reset());
    await TerminalConfig.create({ deviceSN: 'GATE1', machineNumber: 101, terminalType: 'MAIN_GATE', terminalLabel: 'Gate', gateName: 'Main', scansToday: 0, totalScans: 0 });
    await Student.create({ sapId: '1', name: 'Allowed', zktUserID: 11, category: 'dayscholars' });
    await Student.create({ sapId: '2', name: 'Blocked', zktUserID: 12, accessStatus: 'blocked' });
  });

  const scan = (body) => request(app).post('/api/fingerprint/scan').send({ deviceSN: 'GATE1', machineNumber: 101, ...body });

  it('allows a known student', async () => {
    expect((await scan({ userId: 11 })).body).toEqual({ allow: true });
  });

  it('denies a blocked student in software', async () => {
    expect((await scan({ userId: 12 })).body).toEqual({ allow: false });
  });

  it('denies unknown users and unknown terminals', async () => {
    expect((await scan({ userId: 99 })).body).toEqual({ allow: false });
    expect((await scan({ userId: 11, deviceSN: 'OTHER' })).body).toEqual({ allow: false });
  });

  it('denies during maintenance and on disabled terminals', async () => {
    configService.getSystemConfiguration.mockResolvedValueOnce({ maintenanceMode: true, maintenanceMessage: 'x' });
    expect((await scan({ userId: 11 })).body.allow).toBe(false);
    await TerminalConfig.updateOne({ deviceSN: 'GATE1' }, { $set: { enabled: false } });
    expect((await scan({ userId: 11 })).body).toEqual({ allow: false });
  });
});
