const mongoose = require('mongoose');

const reconciliationReportSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, index: true },
    terminalSN: { type: String, required: true },
    source: { type: String, enum: ['sidecar', 'push', 'state'], required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    status: { type: String, enum: ['ok', 'drift', 'error', 'skipped', 'pending_query'], default: 'ok' },
    desiredCount: { type: Number, default: 0 },
    actualCount: { type: Number, default: null },
    missing: { type: [String], default: [] }, // PINs to create
    blockedPresent: { type: [String], default: [] }, // security: blocked student still on device
    extra: { type: [String], default: [] }, // known students that should not be on device
    unknownPins: { type: [String], default: [] }, // PINs not in DB
    queued: { type: Number, default: 0 },
    error: { type: String, default: '' },
  },
  { versionKey: false }
);

reconciliationReportSchema.index({ startedAt: -1 });

module.exports = mongoose.model('ReconciliationReport', reconciliationReportSchema);
