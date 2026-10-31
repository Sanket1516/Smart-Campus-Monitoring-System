const mongoose = require('mongoose');

const COMMAND_TYPES = [
  'createUser',
  'writeTemplate',
  'deleteUser',
  'queryUser',
  'queryTemplate',
  'probe',
];

// superseded: a pending command made obsolete by a newer one (for example a pending
// createUser cancelled by a block). It is never sent.
const COMMAND_STATUSES = ['pending', 'sent', 'acked', 'failed', 'superseded'];
const OPEN_STATUSES = ['pending', 'sent'];

const terminalCommandSchema = new mongoose.Schema(
  {
    terminalSN: {
      type: String,
      required: [true, 'Terminal serial number is required'],
      trim: true,
    },
    // Incrementing per terminal; sent to the terminal as the C:<id>: value.
    cmdId: {
      type: Number,
      required: true,
      min: 1,
    },
    type: {
      type: String,
      enum: COMMAND_TYPES,
      required: true,
    },
    // Structured arguments. The command text is rendered at send time for the terminal's
    // dialect. Template bytes are never stored here: writeTemplate carries a template id.
    params: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // The last rendered text, with any TMP value replaced by its SHA-256.
    textRedacted: {
      type: String,
      default: '',
    },
    dialect: {
      type: String,
      enum: ['classic', 'v3', ''],
      default: '',
    },
    // Higher goes first. Deletes outrank everything so a blocked student is removed early.
    priority: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: COMMAND_STATUSES,
      default: 'pending',
    },
    // true while pending or sent; drives the duplicate-prevention index.
    open: {
      type: Boolean,
      default: true,
    },
    // Distinguishes commands of one type for one student, e.g. writeTemplate:6.
    dedupeKey: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    ackedAt: {
      type: Date,
      default: null,
    },
    returnCode: {
      type: Number,
      default: null,
    },
    lastError: {
      type: String,
      default: '',
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    jobId: {
      type: String,
      default: '',
    },
  },
  { timestamps: true, versionKey: false }
);

terminalCommandSchema.pre('validate', function (next) {
  this.open = OPEN_STATUSES.includes(this.status);
  next();
});

terminalCommandSchema.index({ terminalSN: 1, cmdId: 1 }, { unique: true });
terminalCommandSchema.index(
  { terminalSN: 1, student: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { open: true }, name: 'one_open_command_per_key' }
);
terminalCommandSchema.index({ terminalSN: 1, status: 1, priority: -1, cmdId: 1 });
terminalCommandSchema.index({ status: 1, sentAt: 1 });
terminalCommandSchema.index({ student: 1, status: 1 });
terminalCommandSchema.index({ jobId: 1 });

terminalCommandSchema.statics.COMMAND_TYPES = COMMAND_TYPES;
terminalCommandSchema.statics.COMMAND_STATUSES = COMMAND_STATUSES;
terminalCommandSchema.statics.OPEN_STATUSES = OPEN_STATUSES;

module.exports = mongoose.model('TerminalCommand', terminalCommandSchema);
