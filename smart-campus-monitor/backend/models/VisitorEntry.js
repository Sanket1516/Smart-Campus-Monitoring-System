const mongoose = require('mongoose');

const visitorEntrySchema = new mongoose.Schema(
  {
    visitorName: {
      type: String,
      required: [true, 'Visitor name is required'],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    personToMeet: {
      type: String,
      required: [true, 'Person to meet is required'],
      trim: true,
    },
    meetingReason: {
      type: String,
      required: [true, 'Meeting reason is required'],
      trim: true,
    },
    organization: {
      type: String,
      trim: true,
      default: '',
    },
    idProof: {
      type: String,
      trim: true,
      default: '',
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    checkInTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    enteredBy: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

visitorEntrySchema.index({ date: 1, createdAt: -1 });

module.exports = mongoose.model('VisitorEntry', visitorEntrySchema);
