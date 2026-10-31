const mongoose = require('mongoose');

// One row per ATTLOG line received over push. The unique index drops repeats when a
// terminal re-sends lines it did not see acknowledged.
const pushAttendanceEventSchema = new mongoose.Schema(
  {
    terminalSN: {
      type: String,
      required: true,
      trim: true,
    },
    pin: {
      type: String,
      required: true,
      trim: true,
    },
    // Exactly as sent; push times carry no timezone.
    deviceTimeRaw: {
      type: String,
      required: true,
    },
    deviceTime: {
      type: Date,
      default: null,
    },
    serverReceivedAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      default: '',
    },
    verify: {
      type: String,
      default: '',
    },
    workcode: {
      type: String,
      default: '',
    },
    result: {
      allow: { type: Boolean, default: null },
      reason: { type: String, default: '' },
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
  },
  { versionKey: false }
);

pushAttendanceEventSchema.index({ terminalSN: 1, pin: 1, deviceTimeRaw: 1 }, { unique: true });
pushAttendanceEventSchema.index({ serverReceivedAt: -1 });

module.exports = mongoose.model('PushAttendanceEvent', pushAttendanceEventSchema);
