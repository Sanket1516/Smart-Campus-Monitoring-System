const express = require('express');
const { body, param, query } = require('express-validator');
const {
  getSettingByKey,
  updateSettingByKey,
  getAuditLogs,
  sendTestEmail,
} = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

const allowedSettingKeys = ['notification_settings', 'academic_settings', 'system_configuration'];

router.get(
  '/audit',
  protect,
  authorize('admin'),
  [
    query('adminId').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid admin id'),
    query('dateFrom').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid start date'),
    query('dateTo').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid end date'),
    handleValidation,
  ],
  getAuditLogs
);

router.post(
  '/test-email',
  protect,
  authorize('admin'),
  [body('to').isEmail().withMessage('Recipient email must be valid'), handleValidation],
  sendTestEmail
);

router.get(
  '/:key',
  protect,
  authorize('admin'),
  [
    param('key')
      .isIn(allowedSettingKeys)
      .withMessage('Invalid settings key'),
    handleValidation,
  ],
  getSettingByKey
);

router.put(
  '/:key',
  protect,
  authorize('admin'),
  [
    param('key')
      .isIn(allowedSettingKeys)
      .withMessage('Invalid settings key'),
    body('value').exists().withMessage('Settings value is required'),
    handleValidation,
  ],
  updateSettingByKey
);

module.exports = router;
