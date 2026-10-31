const mongoose = require('mongoose');

/** Last known presence of a student's user record on a terminal. */
const terminalUserStateSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    pin: { type: String, required: true },
    terminalSN: { type: String, required: true },
    present: { type: Boolean, required: true },
    fingers: { type: [Number], default: [] },
    lastConfirmedAt: { type: Date, default: Date.now },
    source: { type: String, enum: ['ack', 'audit'], required: true },
  },
  { timestamps: true, versionKey: false }
);

terminalUserStateSchema.index({ terminalSN: 1, pin: 1 }, { unique: true });
terminalUserStateSchema.index({ student: 1 });

module.exports = mongoose.model('TerminalUserState', terminalUserStateSchema);
