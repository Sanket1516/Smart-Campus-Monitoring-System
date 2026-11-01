const mongoose = require('mongoose');

// One bulk-enrollment run: the validated upload (awaiting the administrator's confirmation) and, after
// confirmation, the per-row outcome. Kept for 30 days so reports can be downloaded again.
const bulkEnrollmentSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileHash: { type: String, default: '' },
    status: {
      type: String,
      enum: ['awaiting_confirmation', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled'],
      default: 'awaiting_confirmation',
      index: true,
    },
    phase: { type: String, default: 'Awaiting confirmation' },
    totals: {
      rows: { type: Number, default: 0 },
      blankRows: { type: Number, default: 0 },
      valid: { type: Number, default: 0 },
      invalid: { type: Number, default: 0 },
      duplicateInFile: { type: Number, default: 0 },
      existing: { type: Number, default: 0 },
      warnings: { type: Number, default: 0 },
    },
    unknownColumns: { type: [String], default: [] },
    progress: {
      total: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      enrolled: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
    // Row statuses: valid | invalid | duplicate_in_file | existing.  Outcomes: enrolled | failed | skipped.
    rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
    error: { type: String, default: '' },
    startedAt: Date,
    finishedAt: Date,
    createdAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 30 } },
  },
  { minimize: false }
);

module.exports = mongoose.models.BulkEnrollment || mongoose.model('BulkEnrollment', bulkEnrollmentSchema);
