const { createClassicDialect } = require('../../services/adms/dialects/classic');
const { createV3Dialect } = require('../../services/adms/dialects/v3');
const { computeTemplateSize } = require('../../services/adms/dialects/common');

const TMP = Buffer.from('fingerprint-template-bytes').toString('base64'); // 26 bytes, 36 chars

describe('classic dialect command builders (exact strings)', () => {
  const classic = createClassicDialect({ sizeMode: 'bytes', emptyFieldMode: 'send' });

  it('builds DATA UPDATE USERINFO with TAB-separated fields', () => {
    expect(
      classic.createUser({ pin: '1001', name: 'Asha Rao', privilege: 0, password: '', card: '', group: 1, timezone: '0000000100000000' })
    ).toBe('DATA UPDATE USERINFO PIN=1001\tName=Asha Rao\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000');
  });

  it('omits empty Passwd/Card/TZ in "omit" mode (UNVERIFIED erase behaviour)', () => {
    const omit = createClassicDialect({ emptyFieldMode: 'omit' });
    expect(omit.createUser({ pin: '7', name: 'B' })).toBe('DATA UPDATE USERINFO PIN=7\tName=B\tPri=0\tGrp=1');
  });

  it('builds DATA UPDATE FINGERTMP with Size in bytes', () => {
    expect(classic.writeTemplate({ pin: '1001', fingerIndex: 6, flag: 1, template: TMP })).toBe(
      `DATA UPDATE FINGERTMP PIN=1001\tFID=6\tSize=26\tValid=1\tTMP=${TMP}`
    );
  });

  it('builds Size in base64 characters when configured', () => {
    const b64 = createClassicDialect({ sizeMode: 'base64' });
    expect(b64.writeTemplate({ pin: '1', fingerIndex: 0, template: TMP })).toBe(
      `DATA UPDATE FINGERTMP PIN=1\tFID=0\tSize=36\tValid=1\tTMP=${TMP}`
    );
    expect(computeTemplateSize(TMP, 'bytes')).toBe(26);
    expect(computeTemplateSize(TMP, 'base64')).toBe(36);
  });

  it('keeps the duress flag (3)', () => {
    expect(classic.writeTemplate({ pin: '1', fingerIndex: 9, flag: 3, template: TMP })).toContain('\tValid=3\t');
  });

  it('builds delete and query commands (never USER ADD / USER DEL)', () => {
    expect(classic.deleteUser({ pin: '1001' })).toBe('DATA DELETE USERINFO PIN=1001');
    expect(classic.queryUser({ pin: '1001' })).toBe('DATA QUERY USERINFO PIN=1001');
    expect(classic.queryTemplate({ pin: '1001', fingerIndex: 0 })).toBe('DATA QUERY FINGERTMP PIN=1001\tFID=0');
    expect(classic.probe({ pin: '999999999' })).toBe('DATA QUERY USERINFO PIN=999999999');
    [classic.createUser({ pin: '1', name: 'x' }), classic.deleteUser({ pin: '1' })].forEach((cmd) => {
      expect(cmd).not.toMatch(/^USER (ADD|DEL)/);
    });
  });

  it('strips TAB/CR/LF from names so they cannot inject fields or commands', () => {
    expect(classic.createUser({ pin: '5', name: 'Evil\tPri=14\nC:1:DATA DELETE USERINFO PIN=1' })).toBe(
      'DATA UPDATE USERINFO PIN=5\tName=Evil Pri=14 C:1:DATA DEL\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ='
    );
  });

  it('rejects invalid PINs, finger indexes, flags and templates', () => {
    expect(() => classic.deleteUser({ pin: '12a' })).toThrow(/Invalid PIN/);
    expect(() => classic.deleteUser({ pin: '1234567890' })).toThrow(/Invalid PIN/);
    expect(() => classic.writeTemplate({ pin: '1', fingerIndex: 10, template: TMP })).toThrow(/finger index/);
    expect(() => classic.writeTemplate({ pin: '1', fingerIndex: 0, flag: 2, template: TMP })).toThrow(/flag/);
    expect(() => classic.writeTemplate({ pin: '1', fingerIndex: 0, template: 'not base64!' })).toThrow(/base64/);
  });
});

describe('v3 dialect command builders', () => {
  const v3 = createV3Dialect({ emptyFieldMode: 'omit' });

  it('builds DATA UPDATE biodata with Type=1 and Tmp=', () => {
    const cmd = v3.writeTemplate({ pin: '1001', fingerIndex: 2, flag: 1, template: TMP });
    expect(cmd).toBe(`DATA UPDATE biodata Pin=1001\tNo=2\tIndex=0\tValid=1\tDuress=0\tType=1\tFormat=0\tTmp=${TMP}`);
    expect(cmd).toMatch(/^DATA UPDATE biodata .*Type=1.*Tmp=/);
  });

  it('maps duress flag to Duress=1', () => {
    expect(v3.writeTemplate({ pin: '1', fingerIndex: 0, flag: 3, template: TMP })).toContain('\tValid=1\tDuress=1\t');
  });

  it('builds user-table commands', () => {
    expect(v3.createUser({ pin: '1001', name: 'Asha' })).toBe(
      'DATA UPDATE user Pin=1001\tGroup=1\tStartTime=0\tEndTime=0\tName=Asha\tPrivilege=0'
    );
    expect(v3.deleteUser({ pin: '1001' })).toBe('DATA DELETE user Pin=1001');
    expect(v3.queryUser({ pin: '1001' })).toBe('DATA QUERY user Pin=1001');
  });

  it('uses configurable table names and version fields', () => {
    const custom = createV3Dialect({ userTable: 'userinfo', biodataTable: 'BIODATA', majorVer: '10', minorVer: '0' });
    expect(custom.deleteUser({ pin: '3' })).toBe('DATA DELETE userinfo Pin=3');
    expect(custom.writeTemplate({ pin: '3', fingerIndex: 0, template: TMP })).toContain('\tType=1\tMajorVer=10\tMinorVer=0\t');
  });
});
