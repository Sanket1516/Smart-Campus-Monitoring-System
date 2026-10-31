const { setIo, emitScanLive, emitScanBlocked, emitSyncAlert, toPublicActivity } = require('../services/socketService');

const fakeIo = () => {
  const sent = [];
  return {
    sent,
    emit: (event, payload) => sent.push({ room: '*', event, payload }),
    to: (room) => ({ emit: (event, payload) => sent.push({ room, event, payload }) }),
  };
};

describe('socket privacy', () => {
  it('sends identifiable scan events to staff only and an anonymised copy to the public room', () => {
    const io = fakeIo();
    setIo(io);
    emitScanLive({ studentName: 'Asha Rao', sapId: '5001', photo: 'x.jpg', type: 'exit', gateName: 'Main', terminalLabel: 'Exit 1', time: 't' });
    emitScanBlocked({ studentName: 'B', sapId: '2', blockReason: 'x', gateName: 'Main' });
    emitSyncAlert({ message: 'PIN 5 mismatch' });
    expect(io.sent.find((m) => m.room === '*')).toBeUndefined();
    const publicMessages = io.sent.filter((m) => m.room === 'public');
    expect(publicMessages.map((m) => m.payload.eventType)).toEqual(['exit', 'blocked']);
    const serialized = JSON.stringify(publicMessages);
    ['Asha', '5001', 'x.jpg', 'blockReason', 'sapId', 'studentName', 'PIN 5'].forEach((secret) => expect(serialized).not.toContain(secret));
    expect(io.sent.filter((m) => m.room === 'staff')).toHaveLength(3);
    setIo(null);
  });

  it('toPublicActivity keeps only gate and time fields', () => {
    expect(Object.keys(toPublicActivity('scan:live', { studentName: 'x', type: 'entry' })).sort()).toEqual(
      ['eventType', 'gateName', 'gateNumber', 'machineNumber', 'terminalLabel', 'terminalNumber', 'time'].sort()
    );
  });
});
