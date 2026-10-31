const { getBiometricConfig } = require('../config/biometricConfig');
const {
  computeTemplateSize,
  effectiveDialect,
  getDialectAdapter,
  redactCommandText,
  resolveDialectFromProbes,
} = require('../services/adms/dialects');

const classic = getDialectAdapter('classic');
const v3 = getDialectAdapter('v3');

const withEnv = (vars, fn) => {
  const saved = {};
  Object.keys(vars).forEach((key) => {
    saved[key] = process.env[key];
    process.env[key] = vars[key];
  });

  try {
    return fn();
  } finally {
    Object.keys(vars).forEach((key) => {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    });
  }
};

describe('classic dialect', () => {
  const config = getBiometricConfig();

  it('builds DATA UPDATE USERINFO with TAB-separated fields', () => {
    expect(
      classic.createUser(
        { pin: '23001', name: 'Asha K', privilege: 0, password: '', card: '0012345678', group: '1', timezone: '' },
        config
      )
    ).toBe('DATA UPDATE USERINFO PIN=23001\tName=Asha K\tPri=0\tPasswd=\tCard=0012345678\tGrp=1\tTZ=');
  });

  it('omits empty fields when ADMS_EMPTY_FIELD_POLICY=omit', () => {
    const omitConfig = withEnv({ ADMS_EMPTY_FIELD_POLICY: 'omit' }, getBiometricConfig);
    expect(classic.createUser({ pin: '23001', name: 'Asha K', privilege: 0 }, omitConfig)).toBe(
      'DATA UPDATE USERINFO PIN=23001\tName=Asha K\tPri=0'
    );
  });

  it('builds DATA UPDATE FINGERTMP', () => {
    expect(
      classic.writeTemplate({ pin: '23001', fingerIndex: 6, flag: 1, size: 1184, templateBase64: 'SoCVUzIx' }, config)
    ).toBe('DATA UPDATE FINGERTMP PIN=23001\tFID=6\tSize=1184\tValid=1\tTMP=SoCVUzIx');
  });

  it('builds delete and query commands', () => {
    expect(classic.deleteUser({ pin: '23001' })).toBe('DATA DELETE USERINFO PIN=23001');
    expect(classic.queryUser({ pin: '23001' })).toBe('DATA QUERY USERINFO PIN=23001');
    expect(classic.queryTemplate({ pin: '23001', fingerIndex: 6 })).toBe('DATA QUERY FINGERTMP PIN=23001\tFID=6');
  });

  it('never emits the rejected USER ADD / USER DEL / DATA DEL forms', () => {
    const all = [
      classic.createUser({ pin: '1', name: 'A' }, config),
      classic.deleteUser({ pin: '1' }),
    ].join('\n');
    expect(all).not.toMatch(/USER ADD|USER DEL|DATA DEL /);
  });

  it('strips tabs and newlines from values and caps the name length', () => {
    const text = classic.createUser({ pin: '7', name: `Evil\tName\nC:99:DATA DELETE USERINFO PIN=1${'x'.repeat(40)}` }, config);
    expect(text.split('\t')).toHaveLength(7);
    expect(text).not.toContain('\n');
    expect(text.split('\t')[1]).toHaveLength('Name='.length + 24);
  });

  it('rejects invalid PINs, finger indexes and non-base64 templates', () => {
    expect(() => classic.deleteUser({ pin: '1\tFID=0' })).toThrow('Invalid PIN');
    expect(() => classic.writeTemplate({ pin: '1', fingerIndex: 10, size: 1, templateBase64: 'AA==' })).toThrow();
    expect(() => classic.writeTemplate({ pin: '1', fingerIndex: 0, size: 1, templateBase64: 'A A' })).toThrow();
  });
});

describe('v3 dialect', () => {
  const config = getBiometricConfig();

  it('builds DATA UPDATE user', () => {
    expect(v3.createUser({ pin: '2', name: 'Ravi', privilege: 0, password: '234', card: '', group: '0' }, config)).toBe(
      'DATA UPDATE user CardNo=\tPin=2\tPassword=234\tGroup=0\tStartTime=0\tEndTime=0\tName=Ravi\tPrivilege=0'
    );
  });

  it('builds DATA UPDATE biodata with Type=1 for fingerprints', () => {
    expect(v3.writeTemplate({ pin: '2', fingerIndex: 0, flag: 1, templateBase64: 'SoCV' }, config)).toBe(
      'DATA UPDATE biodata Pin=2\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorver=10\tMinorver=0\tFormat=0\tTmp=SoCV'
    );
  });

  it('marks duress templates', () => {
    expect(v3.writeTemplate({ pin: '2', fingerIndex: 3, flag: 3, templateBase64: 'SoCV' }, config)).toContain(
      'Valid=1\tDuress=1'
    );
  });

  it('builds delete and query commands', () => {
    expect(v3.deleteUser({ pin: '2' })).toBe('DATA DELETE user Pin=2');
    expect(v3.queryUser({ pin: '2' })).toBe('DATA QUERY tablename=user,fielddesc=*,filter=Pin=2');
    expect(v3.queryTemplate({ pin: '2' })).toBe('DATA QUERY tablename=biodata,fielddesc=*,filter=Pin=2');
  });

  it('can use a space separator', () => {
    const spaceConfig = withEnv({ ADMS_V3_FIELD_SEPARATOR: 'space' }, getBiometricConfig);
    expect(v3.createUser({ pin: '2', name: 'Ravi' }, spaceConfig)).toBe(
      'DATA UPDATE user CardNo= Pin=2 Password= Group= StartTime=0 EndTime=0 Name=Ravi Privilege=0'
    );
  });
});

describe('dialect selection', () => {
  it('accepts a dialect only when its probe returns 0 and the other does not', () => {
    expect(resolveDialectFromProbes({ classicReturn: 0, v3Return: -1004 })).toBe('classic');
    expect(resolveDialectFromProbes({ classicReturn: 0, v3Return: -1 })).toBe('classic');
    expect(resolveDialectFromProbes({ classicReturn: -1004, v3Return: 0 })).toBe('v3');
    expect(resolveDialectFromProbes({ classicReturn: 0, v3Return: null })).toBe('unknown');
    expect(resolveDialectFromProbes({ classicReturn: 0, v3Return: 0 })).toBe('unknown');
    expect(resolveDialectFromProbes({ classicReturn: -1, v3Return: -1 })).toBe('unknown');
  });

  it('holds commands for an unknown dialect unless a policy or override says otherwise', () => {
    expect(effectiveDialect({ dialect: 'unknown' }, getBiometricConfig())).toBeNull();
    expect(effectiveDialect({ dialect: 'v3' }, getBiometricConfig())).toBe('v3');
    expect(
      effectiveDialect({ dialect: 'unknown' }, withEnv({ ADMS_UNKNOWN_DIALECT_POLICY: 'classic' }, getBiometricConfig))
    ).toBe('classic');
    expect(effectiveDialect({ dialect: 'v3' }, withEnv({ ADMS_DIALECT_OVERRIDE: 'classic' }, getBiometricConfig))).toBe(
      'classic'
    );
  });
});

describe('template size and redaction', () => {
  const base = { sizeReported: 1184, byteLength: 888, templateBase64: 'A'.repeat(1184) };

  it('reuses the uploaded Size by default and falls back to bytes', () => {
    expect(computeTemplateSize(base, getBiometricConfig())).toBe(1184);
    expect(computeTemplateSize({ ...base, sizeReported: null }, getBiometricConfig())).toBe(888);
  });

  it('supports explicit bytes and base64_chars modes', () => {
    expect(computeTemplateSize(base, withEnv({ ADMS_FINGERTMP_SIZE_MODE: 'bytes' }, getBiometricConfig))).toBe(888);
    expect(
      computeTemplateSize(
        { ...base, templateBase64: 'AAAA' },
        withEnv({ ADMS_FINGERTMP_SIZE_MODE: 'base64_chars' }, getBiometricConfig)
      )
    ).toBe(4);
  });

  it('removes template data from stored command text', () => {
    expect(redactCommandText('DATA UPDATE FINGERTMP PIN=1\tFID=0\tSize=4\tValid=1\tTMP=SoCV', 'ab')).toBe(
      'DATA UPDATE FINGERTMP PIN=1\tFID=0\tSize=4\tValid=1\tTMP=<redacted sha256:ab>'
    );
    expect(redactCommandText('DATA UPDATE biodata Pin=2\tTmp=SoCV')).toBe('DATA UPDATE biodata Pin=2\tTmp=<redacted>');
  });
});
