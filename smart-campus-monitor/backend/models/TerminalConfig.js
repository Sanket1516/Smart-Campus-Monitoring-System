const mongoose = require('mongoose');

const ALLOWED_TERMINALS_PER_GATE = [1, 2, 3, 4];
const TERMINAL_TYPES = ['ENROLLMENT', 'MAIN_GATE', 'HOSTEL', 'GENERAL'];
const TERMINAL_ROLES = ['enrollment', 'gate'];
const TERMINAL_DIALECTS = ['classic', 'v3', 'unknown'];

const isValidMachineNumber = (machineNumber) => {
  if (machineNumber === 50) {
    return true;
  }

  const gateNumber = Math.floor(machineNumber / 100);
  const terminalNumber = machineNumber % 100;

  return gateNumber >= 1 && ALLOWED_TERMINALS_PER_GATE.includes(terminalNumber);
};

const terminalConfigSchema = new mongoose.Schema(
  {
    machineNumber: {
      type: Number,
      required: [true, 'Machine number is required'],
      unique: true,
      validate: {
        validator: isValidMachineNumber,
        message:
          'Machine number must be 50 for enrollment or follow the gate convention like 101-104, 201-204, 301-304',
      },
    },
    deviceSN: {
      type: String,
      required: [true, 'Device serial number is required'],
      unique: true,
      trim: true,
    },
    deviceName: {
      type: String,
      trim: true,
      default: '',
    },
    gateName: {
      type: String,
      required: [true, 'Gate name is required'],
      trim: true,
    },
    gateNumber: {
      type: Number,
      required: true,
      min: 0,
    },
    terminalNumber: {
      type: Number,
      required: true,
      min: 0,
    },
    terminalLabel: {
      type: String,
      required: [true, 'Terminal label is required'],
      trim: true,
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    terminalIP: {
      type: String,
      trim: true,
      default: '',
    },
    terminalType: {
      type: String,
      enum: TERMINAL_TYPES,
      default: 'GENERAL',
    },
    hostel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hostel',
      default: null,
    },
    maxLocalUsers: {
      type: Number,
      min: 1,
      max: 65535,
      default: 10000,
    },
    isEnrollmentStation: {
      type: Boolean,
      default: false,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    scansToday: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalScans: {
      type: Number,
      default: 0,
      min: 0,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },

    // ── Terminal sync (ADMS push + sidecar) ─────────────────────────────
    // serialNumber === deviceSN and ip === terminalIP (see virtuals below).
    groups: {
      type: [String],
      default: [],
      set: (values) =>
        Array.from(new Set((values || []).map((v) => String(v).trim().toLowerCase()).filter(Boolean))),
    },
    role: {
      type: String,
      enum: TERMINAL_ROLES,
      default: 'gate',
    },
    dialect: {
      type: String,
      enum: TERMINAL_DIALECTS,
      default: 'unknown',
    },
    dialectSource: {
      type: String,
      enum: ['probe', 'manual', 'config', ''],
      default: '',
    },
    pushVersion: { type: String, trim: true, default: '' },
    firmware: { type: String, trim: true, default: '' },
    algorithmVersion: { type: String, trim: true, default: '' },
    deviceInfoRaw: { type: String, trim: true, default: '' },
    tlsSupported: { type: Boolean, default: null },
    lastSyncAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['online', 'offline', 'unknown'],
      default: 'unknown',
    },
    enabled: { type: Boolean, default: true },
    // Only a flag. The comm key itself lives in the sidecar's environment.
    commKeySet: { type: Boolean, default: false },
    // Per-terminal monotonically increasing command id for C:<id>: lines.
    nextCmdId: { type: Number, default: 1, min: 1 },
    attlogStamp: { type: String, default: '' },
    operlogStamp: { type: String, default: '' },
    lastSeenIp: { type: String, default: '' },
    // Lease used to allow at most one sidecar pull job per terminal.
    pullLockUntil: { type: Date, default: null },
    pullLockOwner: { type: String, default: '' },
  },
  { versionKey: false, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

terminalConfigSchema.virtual('serialNumber').get(function () {
  return this.deviceSN;
});
terminalConfigSchema.virtual('ip').get(function () {
  return this.terminalIP;
});
terminalConfigSchema.virtual('lastSeenAt').get(function () {
  return this.lastSeen;
});

terminalConfigSchema.pre('validate', function (next) {
  this.isEnrollmentStation = this.machineNumber === 50;
  this.gateNumber = this.isEnrollmentStation ? 0 : Math.floor(this.machineNumber / 100);
  this.terminalNumber = this.isEnrollmentStation ? 0 : this.machineNumber % 100;
  this.terminalType = this.isEnrollmentStation
    ? 'ENROLLMENT'
    : this.terminalType === 'ENROLLMENT' || !this.terminalType
      ? 'GENERAL'
      : this.terminalType;

  if (this.terminalType !== 'HOSTEL') {
    this.hostel = null;
  }

  this.role = this.isEnrollmentStation ? 'enrollment' : 'gate';

  if (!this.terminalLabel || !this.terminalLabel.trim()) {
    this.terminalLabel = this.isEnrollmentStation
      ? this.gateName || 'Enrollment Station'
      : `${this.gateName} Terminal ${this.terminalNumber}`;
  }

  next();
});

terminalConfigSchema.statics.isValidMachineNumber = isValidMachineNumber;
terminalConfigSchema.index({ terminalType: 1 });
terminalConfigSchema.index({ hostel: 1 });
terminalConfigSchema.statics.TERMINAL_TYPES = TERMINAL_TYPES;
terminalConfigSchema.statics.TERMINAL_ROLES = TERMINAL_ROLES;
terminalConfigSchema.statics.TERMINAL_DIALECTS = TERMINAL_DIALECTS;
terminalConfigSchema.index({ groups: 1 });
terminalConfigSchema.index({ enabled: 1, role: 1 });

module.exports = mongoose.model('TerminalConfig', terminalConfigSchema);
