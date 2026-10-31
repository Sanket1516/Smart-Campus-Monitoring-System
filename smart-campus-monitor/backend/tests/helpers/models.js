/**
 * Model definitions for jest.mock(). Each factory mirrors the real schema's defaults
 * and unique indexes that the sync logic relies on.
 */
const { createMemoryModel } = require('./memoryModel');

const models = {
  TerminalConfig: () =>
    createMemoryModel('TerminalConfig', {
      defaults: () => ({
        groups: [],
        role: 'gate',
        dialect: 'unknown',
        enabled: true,
        isOnline: false,
        nextCmdId: 1,
        terminalType: 'GENERAL',
        isEnrollmentStation: false,
        attlogStamp: '',
        operlogStamp: '',
        pullLockUntil: null,
        pullLockOwner: '',
      }),
      unique: [{ fields: ['deviceSN'] }],
    }),
  Student: () =>
    createMemoryModel('Student', {
      defaults: () => ({
        isActive: true,
        accessStatus: 'allowed',
        fingerprintStatus: 'none',
        targetTerminalGroups: [],
        studentType: 'day_scholar',
        hostel: null,
        consentRef: null,
      }),
      unique: [{ fields: ['sapId'] }, { fields: ['zktUserID'], partial: (d) => d.zktUserID !== undefined && d.zktUserID !== null }],
    }),
  TerminalCommand: () =>
    createMemoryModel('TerminalCommand', {
      defaults: () => ({ status: 'pending', open: true, attempts: 0, sentAt: null, returnCode: null, lastError: '', student: null, templateRef: null, alertRaised: false, params: {} }),
      unique: [
        { fields: ['terminalSN', 'cmdId'] },
        { fields: ['terminalSN', 'student', 'dedupeKey'], partial: (d) => d.open === true, name: 'uniq_open_command' },
      ],
    }),
  TerminalUserState: () =>
    createMemoryModel('TerminalUserState', { defaults: () => ({ fingers: [] }), unique: [{ fields: ['terminalSN', 'pin'] }] }),
  BiometricTemplate: () =>
    createMemoryModel('BiometricTemplate', { defaults: () => ({ flag: 1 }), unique: [{ fields: ['student', 'fingerIndex'] }] }),
  BiometricAuditLog: () => createMemoryModel('BiometricAuditLog', { timestamps: false }),
  BiometricConsent: () => createMemoryModel('BiometricConsent', { defaults: () => ({ withdrawnAt: null }) }),
  AlertLog: () => createMemoryModel('AlertLog', { timestamps: false }),
  AttendancePunch: () =>
    createMemoryModel('AttendancePunch', {
      timestamps: false,
      unique: [{ fields: ['terminalSN', 'pin', 'deviceTimeRaw', 'status'], name: 'uniq_punch' }],
    }),
  ReconciliationReport: () => createMemoryModel('ReconciliationReport', { timestamps: false }),
  Counter: () => createMemoryModel('Counter', { timestamps: false }),
  DeviceAllocation: () => createMemoryModel('DeviceAllocation'),
  SyncJob: () => createMemoryModel('SyncJob', { defaults: () => ({ cursor: 0, done: 0, failed: 0, errorMessages: [], status: 'queued' }) }),
};

module.exports = models;
