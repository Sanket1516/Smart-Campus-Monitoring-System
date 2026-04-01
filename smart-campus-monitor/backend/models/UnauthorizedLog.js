const mongoose = require('mongoose');

const unauthorizedLogSchema = new mongoose.Schema(
  {
    scannedValue: {
      type: String,
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    resolved: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      default: '',
    },
    machineNumber: {
      type: Number,
      default: null,
    },
    deviceSN: {
      type: String,
      default: '',
      trim: true,
    },
    deviceName: {
      type: String,
      default: '',
      trim: true,
    },
    gateName: {
      type: String,
      default: '',
      trim: true,
    },
    gateNumber: {
      type: Number,
      default: null,
    },
    terminalNumber: {
      type: Number,
      default: null,
    },
    terminalLabel: {
      type: String,
      default: '',
      trim: true,
    },
    location: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

unauthorizedLogSchema.index({ machineNumber: 1, createdAt: -1 });

module.exports = mongoose.model('UnauthorizedLog', unauthorizedLogSchema);
