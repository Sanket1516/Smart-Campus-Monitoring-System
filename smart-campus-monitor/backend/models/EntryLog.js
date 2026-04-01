const mongoose = require('mongoose');

const entryLogSchema = new mongoose.Schema(
  {
    sapId: {
      type: String,
      required: true,
      index: true,
    },
    studentName: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['day_scholar', 'hosteller', 'dayscholars', 'hostellers'],
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    entryTime: {
      type: Date,
      default: null,
    },
    exitTime: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['entered', 'exited'],
      default: 'entered',
    },
    lateReturn: {
      type: Boolean,
      default: false,
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

// Compound index for fast lookups
entryLogSchema.index({ sapId: 1, date: 1 });
entryLogSchema.index({ machineNumber: 1, createdAt: -1 });

module.exports = mongoose.model('EntryLog', entryLogSchema);
