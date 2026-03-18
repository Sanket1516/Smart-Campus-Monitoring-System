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
  },
  { timestamps: true }
);

// Compound index for fast lookups
entryLogSchema.index({ sapId: 1, date: 1 });

module.exports = mongoose.model('EntryLog', entryLogSchema);
