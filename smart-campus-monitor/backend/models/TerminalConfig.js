const mongoose = require('mongoose');

const ALLOWED_TERMINALS_PER_GATE = [1, 2, 3, 4];

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
  },
  { versionKey: false }
);

terminalConfigSchema.pre('validate', function (next) {
  this.isEnrollmentStation = this.machineNumber === 50;
  this.gateNumber = this.isEnrollmentStation ? 0 : Math.floor(this.machineNumber / 100);
  this.terminalNumber = this.isEnrollmentStation ? 0 : this.machineNumber % 100;

  if (!this.terminalLabel || !this.terminalLabel.trim()) {
    this.terminalLabel = this.isEnrollmentStation
      ? this.gateName || 'Enrollment Station'
      : `${this.gateName} Terminal ${this.terminalNumber}`;
  }

  next();
});

terminalConfigSchema.statics.isValidMachineNumber = isValidMachineNumber;

module.exports = mongoose.model('TerminalConfig', terminalConfigSchema);
