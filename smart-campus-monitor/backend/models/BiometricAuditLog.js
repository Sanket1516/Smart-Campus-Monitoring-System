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
  'erasure',
  'consent_recorded',
  'consent_withdrawn',
];

// Biometric-specific trail. Never put template data in `detail`.
const biometricAuditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    actorType: {
      type: String,
      enum: ['admin', 'system', 'terminal', 'sidecar'],
      default: 'system',
    },
    action: {
      type: String,
      enum: BIOMETRIC_ACTIONS,
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    terminal: {
      type: String,
      trim: true,
      default: '',
    },
    result: {
      type: String,
      enum: ['success', 'failure', 'queued'],
      required: true,
    },
    detail: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

biometricAuditLogSchema.index({ student: 1, timestamp: -1 });
biometricAuditLogSchema.index({ terminal: 1, timestamp: -1 });
biometricAuditLogSchema.index({ action: 1, timestamp: -1 });

biometricAuditLogSchema.statics.BIOMETRIC_ACTIONS = BIOMETRIC_ACTIONS;

module.exports = mongoose.model('BiometricAuditLog', biometricAuditLogSchema);
