const mongoose = require('mongoose');

const hostelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Hostel name is required'],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    type: {
      type: String,
      enum: ['boys', 'girls', 'mixed'],
      required: [true, 'Hostel type is required'],
    },
    totalRooms: {
      type: Number,
      min: 0,
      default: 0,
    },
    capacity: {
      type: Number,
      min: 0,
      default: 0,
    },
    warden: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: [true, 'Warden is required'],
    },
    wardenPhone: {
      type: String,
      trim: true,
      default: '',
    },
    wardenEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
  },
  { versionKey: false }
);

hostelSchema.index({ code: 1 }, { unique: true, sparse: true });
hostelSchema.index({ warden: 1 });

module.exports = mongoose.model('Hostel', hostelSchema);
