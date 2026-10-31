const mongoose = require('mongoose');

/**
 * Raw ATTLOG punch received over ADMS push. Device time has no timezone, so the
 * raw device string and the server receive time are both stored.
 */
const attendancePunchSchema = new mongoose.Schema(
  {
    terminalSN: { type: String, required: true },
    pin: { type: String, required: true },
    deviceTimeRaw: { type: String, required: true },
    deviceTime: { type: Date, default: null }, // interpreted with ADMS_DEVICE_UTC_OFFSET_MIN
    serverReceivedAt: { type: Date, required: true },
    status: { type: String, default: '' },
    verify: { type: String, default: '' },
    workcode: { type: String, default: '' },
    extra: { type: [String], default: [] },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    processed: {
      type: String,
      enum: ['decision', 'recorded_only', 'error'],
      default: 'recorded_only',
    },
    decision: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { versionKey: false }
);

attendancePunchSchema.index(
  { terminalSN: 1, pin: 1, deviceTimeRaw: 1, status: 1 },
  { unique: true, name: 'uniq_punch' }
);
attendancePunchSchema.index({ serverReceivedAt: -1 });

module.exports = mongoose.model('AttendancePunch', attendancePunchSchema);
