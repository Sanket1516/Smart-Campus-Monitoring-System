const mongoose = require('mongoose');
const { DIALECTS } = require('../config/biometricConfig');

const ALLOWED_TERMINALS_PER_GATE = [1, 2, 3, 4];
const TERMINAL_TYPES = ['ENROLLMENT', 'MAIN_GATE', 'HOSTEL', 'GENERAL'];

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
    // ── Terminal sync (ADMS push + sidecar) ──
    // Group names a student can target, e.g. "main-gate", "hostel-a".
    groups: {
      type: [String],
      default: [],
      set: (values) =>
        [...new Set((values || []).map((value) => String(value).trim().toLowerCase()).filter(Boolean))],
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    // Push dialect, detected by probe commands. See HARDWARE_VERIFICATION.md.
    dialect: {
      type: String,
      enum: DIALECTS,
      default: 'unknown',
    },
    dialectProbe: {
      classicReturn: { type: Number, default: null },
      v3Return: { type: Number, default: null },
      probedAt: { type: Date, default: null },
    },
    pushVersion: {
      type: String,
      trim: true,
      default: '',
    },
    firmware: {
      type: String,
      trim: true,
      default: '',
    },
    algorithmVersion: {
      type: String,
      trim: true,
      default: '',
    },
    // null = not yet tested.
    tlsSupported: {
      type: Boolean,
      default: null,
    },
    // Only whether a comm key is configured. The key itself is never stored here.
    commKeySet: {
      type: Boolean,
      default: false,
    },
    lastPushAt: {
      type: Date,
      default: null,
    },
    // Last INFO= string the terminal sent on getrequest (format UNVERIFIED, kept raw).
    pushInfoRaw: {
      type: String,
      trim: true,
      default: '',
    },
    // Upload stamps the terminal reported; returned in the next handshake.
    admsStamps: {
      attlog: { type: String, default: '' },
      operlog: { type: String, default: '' },
      attphoto: { type: String, default: '' },
    },
    lastSyncAt: {
      type: Date,
      default: null,
    },
    syncStatus: {
      type: String,
      enum: ['unknown', 'ok', 'pending', 'degraded', 'failed'],
      default: 'unknown',
    },
    // Counter for TerminalCommand.cmdId; advanced atomically by the queue.
    nextCmdId: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { versionKey: false }
);

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
terminalConfigSchema.index({ groups: 1 });
terminalConfigSchema.statics.TERMINAL_TYPES = TERMINAL_TYPES;

module.exports = mongoose.model('TerminalConfig', terminalConfigSchema);
