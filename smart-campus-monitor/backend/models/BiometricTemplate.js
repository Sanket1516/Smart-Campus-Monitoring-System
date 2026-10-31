const mongoose = require('mongoose');

/**
 * Encrypted fingerprint template (AES-256-GCM, key from TEMPLATE_ENC_KEY).
 *
 * `data*` fields hold the template string exactly as the source terminal uploaded it
 * (base64 text), encrypted. They are select:false and stripped from every JSON/object
 * serialisation. Never return this model's data from an API.
 */
const biometricTemplateSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    pin: { type: String, required: true, trim: true },
    fingerIndex: { type: Number, required: true, min: 0, max: 9 },
    // 0 invalid, 1 valid, 3 duress
    flag: { type: Number, enum: [0, 1, 3], default: 1 },
    // The Size= value the terminal reported (unit UNVERIFIED: bytes or base64 chars).
    sizeReported: { type: Number, default: null },
    sizeBytes: { type: Number, required: true },
    sizeBase64: { type: Number, required: true },
    // SHA-256 of the decoded template bytes.
    sha256: { type: String, required: true, index: true },
    encoding: { type: String, enum: ['base64'], default: 'base64' },
    dataIv: { type: Buffer, required: true, select: false },
    dataTag: { type: Buffer, required: true, select: false },
    dataEncrypted: { type: Buffer, required: true, select: false },
    keyId: { type: String, required: true },
    sourceTerminal: { type: String, default: '' },
    sourceChannel: {
      type: String,
      enum: ['push', 'sidecar', 'migration', 'manual'],
      default: 'push',
    },
    // Dialect/format the template came in (classic FINGERTMP or v3 biodata).
    sourceDialect: { type: String, enum: ['classic', 'v3', 'zk_tcp', 'unknown'], default: 'unknown' },
    algorithmVersion: { type: String, default: '' },
  },
  { timestamps: true, versionKey: false }
);

biometricTemplateSchema.index({ student: 1, fingerIndex: 1 }, { unique: true });

const strip = (_doc, ret) => {
  delete ret.dataIv;
  delete ret.dataTag;
  delete ret.dataEncrypted;
  return ret;
};
biometricTemplateSchema.set('toJSON', { transform: strip });
biometricTemplateSchema.set('toObject', { transform: strip });

module.exports = mongoose.model('BiometricTemplate', biometricTemplateSchema);
