const mongoose = require('mongoose');

const hostellerRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
    },
    hostel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hostel',
      required: [true, 'Hostel is required'],
    },
    warden: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: [true, 'Warden is required'],
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
    },
    requestedExitTime: {
      type: Date,
      default: null,
    },
    expectedReturnTime: {
      type: Date,
      required: [true, 'Expected return time is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'expired', 'completed'],
      default: 'pending',
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },
    accessValidUntil: {
      type: Date,
      default: null,
    },
    usedForExit: {
      type: Boolean,
      default: false,
    },
    usedForEntry: {
      type: Boolean,
      default: false,
    },
    lastAlertSentAt: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

hostellerRequestSchema.index({ student: 1, status: 1, accessValidUntil: 1 });
hostellerRequestSchema.index({ hostel: 1 });
hostellerRequestSchema.index({ warden: 1 });

module.exports = mongoose.model('HostellerRequest', hostellerRequestSchema);
