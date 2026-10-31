const {
  parseAttlog,
  parseDeviceCmdBody,
  parseDeviceTime,
  parseInfo,
  parseRecordLines,
} = require('../services/adms/parsers');
const { ipInCidr, isAllowedSource } = require('../middleware/terminalGuard');

describe('ATTLOG parser', () => {
  it('reads PIN, Time, Status, Verify and Workcode', () => {
    expect(parseAttlog('23001\t2026-11-10 14:44:01\t0\t1\t0\r\n23002\t2026-11-10 14:45:00\t1\t1')).toEqual([
      { pin: '23001', time: '2026-11-10 14:44:01', status: '0', verify: '1', workcode: '0' },
      { pin: '23002', time: '2026-11-10 14:45:00', status: '1', verify: '1', workcode: '' },
    ]);
  });

  it('skips blank and malformed lines', () => {
    expect(parseAttlog('\n\nnot a line\n5\tyesterday\t0\n')).toEqual([]);
  });

  it('reads the device time in the configured offset', () => {
    expect(parseDeviceTime('2026-11-10 14:44:01', '+05:30').toISOString()).toBe('2026-11-10T09:14:01.000Z');
    expect(parseDeviceTime('2026-11-10T14:44:01', '+05:30')).toBeNull();
    expect(parseDeviceTime('2026-11-10 14:44:01', 'IST')).toBeNull();
  });
});

describe('record parser', () => {
  it('reads USER, FP and OPLOG lines from OPERLOG', () => {
    const body = [
      'OPLOG 6\t0\t2026-11-10 14:00:00\t5\t0\t0\t0',
      'USER PIN=5\tName=Asha\tPri=0\tPasswd=\tCard=123\tGrp=1\tTZ=',
      'FP PIN=5\tFID=6\tSize=8\tValid=1\tTMP=SoCVUzIx',
    ].join('\n');

    expect(parseRecordLines(body, 'OPERLOG')).toEqual({
      users: [{ pin: '5', name: 'Asha', privilege: '0', card: '123', group: '1' }],
      fingers: [{ pin: '5', fingerIndex: 6, sizeReported: 8, flag: 1, templateBase64: 'SoCVUzIx' }],
      operations: 1,
    });
  });

  it('reads bare PIN= lines by table name', () => {
    expect(parseRecordLines('PIN=5\tFID=2\tSize=4\tValid=3\tTMP=AAAA', 'FINGERTMP').fingers).toEqual([
      { pin: '5', fingerIndex: 2, sizeReported: 4, flag: 3, templateBase64: 'AAAA' },
    ]);
    expect(parseRecordLines('PIN=5\tName=Asha', 'USERINFO').users[0].pin).toBe('5');
  });

  it('keeps base64 padding inside TMP values', () => {
    expect(parseRecordLines('FP PIN=5\tFID=0\tSize=4\tValid=1\tTMP=QUI=', 'OPERLOG').fingers[0].templateBase64).toBe('QUI=');
  });

  it('reads v3 biodata fingerprint rows only', () => {
    const body = [
      'BIODATA Pin=2\tNo=3\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=10\tMinorVer=0\tFormat=0\tTmp=AAAA',
      'BIODATA Pin=2\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tTmp=BBBB',
    ].join('\n');

    expect(parseRecordLines(body, 'BIODATA').fingers).toEqual([
      { pin: '2', fingerIndex: 3, sizeReported: null, flag: 1, templateBase64: 'AAAA' },
    ]);
  });

  it('drops finger indexes outside 0 to 9', () => {
    expect(parseRecordLines('FP PIN=5\tFID=12\tSize=4\tValid=1\tTMP=AAAA', 'OPERLOG').fingers).toEqual([]);
  });
});

describe('devicecmd parser', () => {
  it('reads one ack per line', () => {
    expect(parseDeviceCmdBody('ID=101&Return=0&CMD=DATA\nID=102&Return=-1004&CMD=DATA\ngarbage')).toEqual([
      { cmdId: 101, returnCode: 0, cmd: 'DATA' },
      { cmdId: 102, returnCode: -1004, cmd: 'DATA' },
    ]);
  });
});

describe('INFO parser', () => {
  it('keeps the raw string and reads firmware and algorithm positions', () => {
    expect(parseInfo('Ver 6.60 Apr 2020,12,20,300,10.20.0.5,10,0,0,0')).toEqual({
      raw: 'Ver 6.60 Apr 2020,12,20,300,10.20.0.5,10,0,0,0',
      firmware: 'Ver 6.60 Apr 2020',
      fpAlgorithm: '10',
    });
  });
});

describe('terminal source check', () => {
  it('matches IPv4 CIDRs, including IPv4-mapped IPv6', () => {
    expect(ipInCidr('10.20.3.4', '10.20.0.0/16')).toBe(true);
    expect(ipInCidr('::ffff:10.20.3.4', '10.20.0.0/16')).toBe(true);
    expect(ipInCidr('10.21.0.1', '10.20.0.0/16')).toBe(false);
    expect(ipInCidr('10.20.3.4', '10.20.3.4')).toBe(true);
  });

  it('allows only loopback when no CIDRs are configured', () => {
    expect(isAllowedSource('127.0.0.1', [])).toBe(true);
    expect(isAllowedSource('::1', [])).toBe(true);
    expect(isAllowedSource('10.20.3.4', [])).toBe(false);
  });
});
