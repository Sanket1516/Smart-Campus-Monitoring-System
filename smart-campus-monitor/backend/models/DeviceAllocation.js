const mongoose = require('mongoose');

const deviceAllocationSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TerminalConfig',
      required: true,
      index: true,
    },
    localUserId: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { timestamps: true }
);

deviceAllocationSchema.index({ studentId: 1, deviceId: 1 }, { unique: true });
deviceAllocationSchema.index({ deviceId: 1, localUserId: 1 }, { unique: true });

module.exports = mongoose.model('DeviceAllocation', deviceAllocationSchema);
