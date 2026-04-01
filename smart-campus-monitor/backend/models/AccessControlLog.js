const mongoose = require('mongoose');

const accessControlLogSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
    },
    action: {
      type: String,
      enum: ['blocked', 'unblocked'],
      required: [true, 'Action is required'],
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

accessControlLogSchema.index({ student: 1, timestamp: -1 });

module.exports = mongoose.model('AccessControlLog', accessControlLogSchema);
