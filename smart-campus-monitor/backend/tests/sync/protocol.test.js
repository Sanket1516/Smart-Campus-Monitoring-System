const p = require('../../services/adms/protocol');

describe('ADMS protocol helpers', () => {
  it('parses ATTLOG lines (PIN\\tTime\\tStatus\\tVerify\\tWorkcode)', () => {
    const body = '1001\t2026-10-31 08:15:02\t0\t1\t0\t0\t0\r\n1002\t2026-10-31 08:16:00\t1\t15\t0\nbroken line\n';
    const { records, errors } = p.parseAttlog(body);
    expect(records).toEqual([
      { pin: '1001', time: '2026-10-31 08:15:02', status: '0', verify: '1', workcode: '0', extra: ['0', '0'] },
      { pin: '1002', time: '2026-10-31 08:16:00', status: '1', verify: '15', workcode: '0', extra: [] },
    ]);
    expect(errors).toHaveLength(1);
  });

  it('interprets device time with a configured UTC offset', () => {
    expect(p.parseDeviceTime('2026-10-31 08:00:00', 330).toISOString()).toBe('2026-10-31T02:30:00.000Z');
    expect(p.parseDeviceTime('2026-10-31 08:00:00', 0).toISOString()).toBe('2026-10-31T08:00:00.000Z');
    expect(p.parseDeviceTime('garbage', 330)).toBeNull();
  });

  it('parses devicecmd acknowledgements (one or many lines)', () => {
    expect(p.parseDeviceCmdBody('ID=12&Return=0&CMD=DATA\nID=13&Return=-1004&CMD=DATA\nnoise')).toEqual([
      { id: 12, returnCode: 0, cmd: 'DATA' },
      { id: 13, returnCode: -1004, cmd: 'DATA' },
    ]);
  });

  it('formats commands as C:<id>:<command> lines', () => {
    expect(p.formatCommandLines([{ cmdId: 1, text: 'DATA DELETE USERINFO PIN=1' }, { cmdId: 2, text: 'DATA QUERY USERINFO PIN=2' }])).toBe(
      'C:1:DATA DELETE USERINFO PIN=1\nC:2:DATA QUERY USERINFO PIN=2'
    );
  });

  it('parses OPERLOG uploads: USER, FP (classic) and BIODATA (v3), keeping base64 padding', () => {
    const tmp = Buffer.from('abcde').toString('base64'); // "YWJjZGU=" has padding
    const body = [
      'USER PIN=1001\tName=Asha\tPri=0\tPasswd=\tCard=\tGrp=1',
      `FP PIN=1001\tFID=0\tSize=5\tValid=1\tTMP=${tmp}`,
      `BIODATA Pin=1002\tNo=3\tIndex=0\tValid=1\tDuress=1\tType=1\tMajorVer=10\tMinorVer=0\tFormat=0\tTmp=${tmp}`,
      `BIODATA Pin=1003\tNo=0\tType=9\tTmp=${tmp}`,
      'OPLOG 4\t0\t2026-10-31 08:00:00\t1001\t0\t0\t0',
    ].join('\n');
    const parsed = p.parseOperationLines(body, 'OPERLOG');
    expect(parsed.users).toEqual([{ pin: '1001', name: 'Asha', privilege: '0', hasPassword: false, hasCard: false }]);
    expect(parsed.templates).toEqual([
      { dialect: 'classic', pin: '1001', fingerIndex: 0, flag: 1, sizeReported: 5, template: tmp },
      { dialect: 'v3', pin: '1002', fingerIndex: 3, flag: 3, sizeReported: null, majorVer: '10', minorVer: '0', template: tmp },
    ]);
    expect(parsed.operations).toHaveLength(1);
  });

  it('parses bare FINGERTMP table lines', () => {
    const parsed = p.parseOperationLines('PIN=5\tFID=1\tSize=3\tValid=1\tTMP=YWJj', 'FINGERTMP');
    expect(parsed.templates[0]).toMatchObject({ pin: '5', fingerIndex: 1, template: 'YWJj' });
  });

  it('builds the handshake option block with overrides', () => {
    const text = p.buildHandshakeOptions({ sn: 'SN1', attlogStamp: '99', timeZone: '5.5', overrides: { Delay: '10', ErrorDelay: null } });
    const lines = text.split('\n');
    expect(lines[0]).toBe('GET OPTION FROM: SN1');
    expect(lines).toEqual(expect.arrayContaining(['ATTLOGStamp=99', 'Realtime=1', 'Encrypt=0', 'TimeZone=5.5', 'Delay=10']));
    expect(text).not.toMatch(/ErrorDelay/);
  });

  it('parses INFO= best effort', () => {
    expect(p.parseDeviceInfo('Ver 6.60 Apr 2020,120,240,5000,10.0.0.5,10,0,0,0')).toMatchObject({
      firmware: 'Ver 6.60 Apr 2020',
      userCount: 120,
      fingerprintCount: 240,
      ip: '10.0.0.5',
      algorithmVersion: '10',
    });
  });
});
