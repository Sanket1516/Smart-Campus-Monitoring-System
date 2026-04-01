const express = require('express');
const { body, param } = require('express-validator');
const {
  initiateEnrollment,
  confirmEnrollment,
  updateEnrollmentType,
  getEnrollmentStats,
} = require('../controllers/enrollmentController');
const { protect, authorize } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

const studentIdValidator = param('studentId').isMongoId().withMessage('Invalid student id');

const sharedEnrollmentValidators = [
  body('zktUserID')
    .isInt({ min: 1, max: 10000 })
    .withMessage('ZKT user ID must be between 1 and 10000')
    .toInt(),
];

router.post(
  '/initiate/:studentId',
  protect,
  authorize('admin'),
  [
    studentIdValidator,
    ...sharedEnrollmentValidators,
    handleValidation,
  ],
  initiateEnrollment
);

router.post(
  '/confirm/:studentId',
  protect,
  authorize('admin'),
  [
    studentIdValidator,
    ...sharedEnrollmentValidators,
    body('studentType')
      .isIn(['day_scholar', 'hosteller'])
      .withMessage('Student type must be day_scholar or hosteller'),
    body('hostelId').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid hostel id'),
    body('roomNumber').optional({ values: 'falsy' }).trim(),
    body('wardenApprovalRequired').optional().isBoolean().withMessage('Warden approval flag must be boolean'),
    handleValidation,
  ],
  confirmEnrollment
);

router.put(
  '/update-type/:studentId',
  protect,
  authorize('admin'),
  [
    studentIdValidator,
    body('studentType')
      .isIn(['day_scholar', 'hosteller'])
      .withMessage('Student type must be day_scholar or hosteller'),
    body('hostelId').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid hostel id'),
    body('roomNumber').optional({ values: 'falsy' }).trim(),
    body('wardenApprovalRequired').optional().isBoolean().withMessage('Warden approval flag must be boolean'),
    handleValidation,
  ],
  updateEnrollmentType
);

router.get('/stats', protect, authorize('admin'), getEnrollmentStats);

module.exports = router;
