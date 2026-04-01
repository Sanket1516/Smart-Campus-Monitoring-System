const express = require('express');
const { body, param } = require('express-validator');
const {
  blockStudent,
  unblockStudent,
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

router.get('/blocked', protect, authorize('admin', 'security'), getBlockedStudents);
router.get(
  '/log/:studentId',
  protect,
  authorize('admin', 'security'),
  [param('studentId').isMongoId().withMessage('Invalid student id'), handleValidation],
  getAccessLogs
);

module.exports = router;
