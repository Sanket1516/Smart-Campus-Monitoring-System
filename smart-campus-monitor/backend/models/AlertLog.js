const mongoose = require('mongoose');

const alertLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['blocked', 'unauthorized', 'late_return', 'terminal_offline'],
      required: [true, 'Alert type is required'],
    },
    message: {
      type: String,
      required: [true, 'Alert message is required'],
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
      },
    ],
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

alertLogSchema.index({ type: 1, timestamp: -1 });
alertLogSchema.index({ readBy: 1 });

module.exports = mongoose.model('AlertLog', alertLogSchema);
