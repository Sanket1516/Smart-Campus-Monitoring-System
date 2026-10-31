const mongoose = require('mongoose');

const BIOMETRIC_ACTIONS = [
  'template_read',
  'template_write',
  'template_store',
  'template_delete',
  'user_create',
  'user_delete',
  'block',
  'unblock',
  'resync',
  'enroll_start',
  'erase',
  'consent_record',
  'consent_withdraw',
  'reconcile',
  'backup',
  'migration',
];

/** Append-only log of every biometric operation. Never contains template data. */
const biometricAuditLogSchema = new mongoose.Schema(
  {
    actor: { type: String, required: true }, // admin id, "system", "terminal:<SN>", "sidecar"
    actorAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    action: { type: String, enum: BIOMETRIC_ACTIONS, required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    terminal: { type: String, default: '' },
    result: { type: String, default: 'ok' },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

biometricAuditLogSchema.index({ timestamp: -1 });
biometricAuditLogSchema.index({ student: 1, timestamp: -1 });
biometricAuditLogSchema.index({ terminal: 1, timestamp: -1 });
biometricAuditLogSchema.statics.BIOMETRIC_ACTIONS = BIOMETRIC_ACTIONS;

module.exports = mongoose.model('BiometricAuditLog', biometricAuditLogSchema);
