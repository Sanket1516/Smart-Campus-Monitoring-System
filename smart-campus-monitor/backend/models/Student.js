const mongoose = require('mongoose');
const {
  COURSE_OPTIONS,
  normalizeCategory,
  normalizeCourse,
  normalizeDepartment,
  getDepartmentOptions,
} = require('../utils/studentMeta');

const studentSchema = new mongoose.Schema(
  {
    sapId: {
      type: String,
      required: [true, 'SAP ID is required'],
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    parentEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    parentPhone: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ['dayscholars', 'hostellers'],
      required: [true, 'Student category is required'],
      set: normalizeCategory,
    },
    course: {
      type: String,
      enum: COURSE_OPTIONS,
      required: [true, 'Course is required'],
      set: normalizeCourse,
    },
    department: {
      type: String,
      trim: true,
      required: [true, 'Department is required'],
      set: normalizeDepartment,
    },
    year: {
      type: Number,
      min: 1,
      max: 5,
    },
    zktUserID: {
      type: Number,
    },
    fingerprintEnrolled: {
      type: Boolean,
      default: false,
    },
    fingerprintEnrolledAt: {
      type: Date,
      default: null,
    },
    fingerprintTemplate: {
      type: String,
      select: false,
      default: null,
    },
    studentType: {
      type: String,
      enum: ['day_scholar', 'hosteller'],
      default: 'day_scholar',
    },
    hostel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hostel',
      default: null,
    },
    roomNumber: {
      type: String,
      trim: true,
      default: '',
    },
    isHosteller: {
      type: Boolean,
      default: false,
    },
    wardenApprovalRequired: {
      type: Boolean,
      default: false,
    },
    accessStatus: {
      type: String,
      enum: ['allowed', 'blocked'],
      default: 'allowed',
    },
    blockReason: {
      type: String,
      trim: true,
      default: '',
    },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    blockedAt: {
      type: Date,
      default: null,
    },
    unblockReason: {
      type: String,
      trim: true,
      default: '',
    },
    unblockedAt: {
      type: Date,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    bloodGroup: {
      type: String,
      trim: true,
      default: '',
    },
    photoUrl: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

studentSchema.index({ zktUserID: 1 }, { unique: true, sparse: true });
studentSchema.index({ hostel: 1 });
studentSchema.index({ studentType: 1 });
studentSchema.index({ accessStatus: 1 });

studentSchema.pre('validate', function (next) {
  const allowedDepartments = getDepartmentOptions(this.course);

  if (!allowedDepartments.length) {
    return next(new Error('Invalid course selected'));
  }

  if (!allowedDepartments.includes(this.department)) {
    return next(
      new Error(
        `Department must be one of: ${allowedDepartments.join(', ')} for course ${this.course}`
      )
    );
  }

  next();
});

module.exports = mongoose.model('Student', studentSchema);
