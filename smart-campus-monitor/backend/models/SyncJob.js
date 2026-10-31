const mongoose = require('mongoose');

/** Long-running sidecar job (bulk load, reconciliation pull). Resumable after restart. */
const syncJobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['bulk_load', 'template_fetch', 'backup'], required: true },
    terminalSN: { type: String, required: true },
    studentIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    cursor: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    done: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    errorMessages: { type: [String], default: [] },
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'paused'], default: 'queued' },
    actor: { type: String, default: 'system' },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

syncJobSchema.index({ status: 1, kind: 1 });

module.exports = mongoose.model('SyncJob', syncJobSchema);
