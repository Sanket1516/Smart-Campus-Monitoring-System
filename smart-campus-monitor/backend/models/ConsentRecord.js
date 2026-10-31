const mongoose = require('mongoose');

// One record per consent given. DPDP Act 2023 s.9(1) requires verifiable parental consent
// for a child (under 18). This model stores what was recorded; it is not legal advice.
const consentRecordSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
      index: true,
    },
    consentType: {
      type: String,
      enum: ['self', 'parental'],
      required: [true, 'Consent type is required'],
    },
    givenByName: {
      type: String,
      required: [true, 'Name of the person giving consent is required'],
      trim: true,
    },
    relationship: {
      type: String,
      trim: true,
      default: 'self',
    },
    method: {
      type: String,
      enum: ['paper_form', 'digital_form', 'digilocker', 'other'],
      required: [true, 'Consent method is required'],
    },
    // Reference to the signed form or verification record, not the document itself.
    evidenceRef: {
      type: String,
      trim: true,
      default: '',
    },
    purpose: {
      type: String,
      trim: true,
      default: 'Campus entry and exit verification by fingerprint',
    },
    givenAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    withdrawnAt: {
      type: Date,
      default: null,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

consentRecordSchema.methods.isActive = function () {
  return !this.withdrawnAt;
};

module.exports = mongoose.model('ConsentRecord', consentRecordSchema);
