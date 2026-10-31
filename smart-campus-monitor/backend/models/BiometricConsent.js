const mongoose = require('mongoose');

/**
 * Consent record for biometric processing (DPDP Act 2023). For a child (under 18)
 * consent must be given by a parent or lawful guardian (s.9(1)). Not legal advice.
 */
const biometricConsentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    isMinor: { type: Boolean, required: true },
    givenBy: { type: String, enum: ['self', 'parent', 'guardian'], required: true },
    giverName: { type: String, trim: true, required: true },
    giverContact: { type: String, trim: true, default: '' },
    method: { type: String, enum: ['paper', 'electronic'], default: 'paper' },
    // Reference to the signed form (file number, DMS id). Not the document itself.
    documentRef: { type: String, trim: true, default: '' },
    noticeVersion: { type: String, trim: true, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    recordedAt: { type: Date, default: Date.now },
    withdrawnAt: { type: Date, default: null },
    withdrawnReason: { type: String, trim: true, default: '' },
  },
  { versionKey: false, timestamps: true }
);

biometricConsentSchema.pre('validate', function (next) {
  if (this.isMinor && this.givenBy === 'self') {
    return next(new Error('Consent for a minor must be given by a parent or guardian'));
  }
  return next();
});

module.exports = mongoose.model('BiometricConsent', biometricConsentSchema);
