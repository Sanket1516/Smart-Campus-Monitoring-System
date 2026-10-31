const mongoose = require('mongoose');

const COMMAND_TYPES = [
  'USER_CREATE',
  'TEMPLATE_WRITE',
  'USER_DELETE',
  'USER_QUERY',
  'USER_QUERY_ALL',
  'TEMPLATE_QUERY',
  'PROBE',
  'ENROLL_FP',
];

const COMMAND_STATUSES = ['pending', 'sent', 'acked', 'failed', 'cancelled'];

/**
 * Per-terminal command queue. Persisted, so nothing is lost if the server or a
 * terminal restarts. `open` is true while pending/sent; the partial unique index on
 * (terminalSN, student, dedupeKey) prevents duplicate open commands.
 */
const terminalCommandSchema = new mongoose.Schema(
  {
    terminalSN: { type: String, required: true, trim: true },
    cmdId: { type: Number, required: true },
    type: { type: String, enum: COMMAND_TYPES, required: true },
    dialect: { type: String, enum: ['classic', 'v3'], required: true },
    // Stored text. For TEMPLATE_WRITE the template is redacted and rendered at send time.
    text: { type: String, required: true },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    templateRef: { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricTemplate', default: null },
    dedupeKey: { type: String, required: true },
    status: { type: String, enum: COMMAND_STATUSES, default: 'pending' },
    open: { type: Boolean, default: true },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, default: null },
    ackedAt: { type: Date, default: null },
    returnCode: { type: Number, default: null },
    lastError: { type: String, default: '' },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    pin: { type: String, default: '' },
    jobId: { type: String, default: '' },
    priority: { type: Number, default: 100 },
    alertRaised: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

terminalCommandSchema.index({ terminalSN: 1, cmdId: 1 }, { unique: true });
terminalCommandSchema.index(
  { terminalSN: 1, student: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { open: true }, name: 'uniq_open_command' }
);
terminalCommandSchema.index({ terminalSN: 1, status: 1, priority: 1, cmdId: 1 });
terminalCommandSchema.index({ status: 1, sentAt: 1 });
terminalCommandSchema.index({ student: 1, status: 1 });
terminalCommandSchema.index({ jobId: 1 });

terminalCommandSchema.statics.COMMAND_TYPES = COMMAND_TYPES;
terminalCommandSchema.statics.COMMAND_STATUSES = COMMAND_STATUSES;

module.exports = mongoose.model('TerminalCommand', terminalCommandSchema);
