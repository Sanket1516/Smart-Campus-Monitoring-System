const mongoose = require('mongoose');

const TEMPLATE_FLAGS = [0, 1, 3]; // 0 invalid, 1 valid, 3 duress
const SOURCE_FORMATS = ['adms_base64', 'zk_tcp_raw', 'legacy_migration'];

const biometricTemplateSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
    },
    fingerIndex: {
      type: Number,
      required: [true, 'Finger index is required'],
      min: 0,
      max: 9,
    },
    flag: {
      type: Number,
      enum: TEMPLATE_FLAGS,
      default: 1,
    },
    // The Size value exactly as the source terminal reported it (unit UNVERIFIED).
    sizeReported: {
      type: Number,
      default: null,
    },
    byteLength: {
      type: Number,
      required: true,
      min: 1,
    },
    sha256: {
      type: String,
      required: true,
      match: /^[0-9a-f]{64}$/,
    },
    // AES-256-GCM. Never selected by default and stripped from every serialisation.
    dataEncrypted: {
      type: {
        iv: Buffer,
        tag: Buffer,
        ct: Buffer,
      },
      required: true,
      select: false,
    },
    sourceFormat: {
      type: String,
      enum: SOURCE_FORMATS,
      required: true,
    },
    sourceTerminal: {
      type: String,
      trim: true,
      default: '',
    },
    algorithmVersion: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true, versionKey: false }
);

const stripSecret = (_doc, ret) => {
  delete ret.dataEncrypted;
  return ret;
};

biometricTemplateSchema.set('toJSON', { transform: stripSecret });
biometricTemplateSchema.set('toObject', { transform: stripSecret });

biometricTemplateSchema.index({ student: 1, fingerIndex: 1 }, { unique: true });

biometricTemplateSchema.statics.TEMPLATE_FLAGS = TEMPLATE_FLAGS;
biometricTemplateSchema.statics.SOURCE_FORMATS = SOURCE_FORMATS;

module.exports = mongoose.model('BiometricTemplate', biometricTemplateSchema);
