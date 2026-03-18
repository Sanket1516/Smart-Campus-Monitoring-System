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
