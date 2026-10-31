const mongoose = require('mongoose');

/** Last known presence of a student's user record on a terminal. */
const terminalUserStateSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    pin: { type: String, required: true },
    terminalSN: { type: String, required: true },
    present: { type: Boolean, required: true },
    fingers: { type: [Number], default: [] },
    // Per-finger write/verification state on this terminal.
    templates: {
      type: [
        {
          _id: false,
          fingerIndex: Number,
          sha256: String,
          state: { type: String, enum: ['stored', 'verified', 'mismatch'] },
          via: { type: String, enum: ['ack', 'sidecar_readback', 'push_readback', 'ack_policy'] },
          at: Date,
        },
      ],
      default: [],
    },
    // Absence confirmed by reading the device's user list (sidecar), not just a delete ack.
    absenceVerifiedAt: { type: Date, default: null },
    lastConfirmedAt: { type: Date, default: Date.now },
    source: { type: String, enum: ['ack', 'audit'], required: true },
  },
  { timestamps: true, versionKey: false }
);

terminalUserStateSchema.index({ terminalSN: 1, pin: 1 }, { unique: true });
terminalUserStateSchema.index({ student: 1 });

module.exports = mongoose.model('TerminalUserState', terminalUserStateSchema);
