const express = require('express');
const { body, param } = require('express-validator');
const {
  blockStudent,
  blockStudentsByType,
  unblockStudent,
  unblockStudentsByType,
  getBlockedStudents,
  getAccessLogs,
} = require('../controllers/accessController');
const { protect, authorize } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

router.post(
  '/block/:studentId',
  protect,
  authorize('admin'),
  [
    param('studentId').isMongoId().withMessage('Invalid student id'),
    body('reason').trim().notEmpty().withMessage('Block reason is required'),
    body('note').optional({ values: 'falsy' }).trim(),
    handleValidation,
  ],
  blockStudent
);

router.post(
  '/block-bulk',
  protect,
  authorize('admin'),
  [
    body('studentType')
      .isIn(['day_scholar', 'hosteller'])
      .withMessage('Valid student type is required'),
    body('reason').trim().notEmpty().withMessage('Block reason is required'),
    body('note').optional({ values: 'falsy' }).trim(),
    handleValidation,
  ],
  blockStudentsByType
);

router.post(
  '/unblock/:studentId',
  protect,
  authorize('admin'),
  [
    param('studentId').isMongoId().withMessage('Invalid student id'),
    body('reason').trim().notEmpty().withMessage('Unblock reason is required'),
    handleValidation,
  ],
  unblockStudent
);

router.post(
  '/unblock-bulk',
  protect,
  authorize('admin'),
  [
    body('studentType')
      .isIn(['day_scholar', 'hosteller'])
      .withMessage('Valid student type is required'),
    body('reason').trim().notEmpty().withMessage('Unblock reason is required'),
    handleValidation,
  ],
  unblockStudentsByType
);

router.get('/blocked', protect, authorize('admin', 'security'), getBlockedStudents);
router.get(
  '/log/:studentId',
  protect,
  authorize('admin', 'security'),
  [param('studentId').isMongoId().withMessage('Invalid student id'), handleValidation],
  getAccessLogs
);

module.exports = router;
