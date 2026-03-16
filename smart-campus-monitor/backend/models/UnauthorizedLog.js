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
  },
  { timestamps: true }
);

module.exports = mongoose.model('UnauthorizedLog', unauthorizedLogSchema);
