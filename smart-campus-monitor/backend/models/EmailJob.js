const mongoose = require('mongoose');

// Outbox row for one email. Rows are written before sending, so a restart or crash never loses mail.
const emailJobSchema = new mongoose.Schema(
  {
    to: { type: String, required: true },
    subject: { type: String, required: true },
    text: String,
    html: String,
    attachments: { type: mongoose.Schema.Types.Mixed, default: [] },
    status: { type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending', index: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    lastError: String,
    messageId: String,
    sentAt: Date,
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

emailJobSchema.index({ status: 1, createdAt: 1, _id: 1 });

module.exports = mongoose.models.EmailJob || mongoose.model('EmailJob', emailJobSchema);
