const mongoose = require('mongoose');

// What the server believes is on each terminal, confirmed by a command ack or an audit.
const terminalUserStateSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    terminalSN: {
      type: String,
      required: true,
      trim: true,
    },
    present: {
      type: Boolean,
      default: false,
    },
    fingerIndexes: {
      type: [Number],
      default: [],
    },
    lastConfirmedAt: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
      enum: ['ack', 'audit'],
      default: 'ack',
    },
  },
  { timestamps: true, versionKey: false }
);

terminalUserStateSchema.index({ student: 1, terminalSN: 1 }, { unique: true });
terminalUserStateSchema.index({ terminalSN: 1, present: 1 });

module.exports = mongoose.model('TerminalUserState', terminalUserStateSchema);
