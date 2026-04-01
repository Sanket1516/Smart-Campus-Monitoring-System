const express = require('express');
const { body } = require('express-validator');
const {
  processFingerprintScan,
  processFingerprintHeartbeat,
} = require('../controllers/fingerprintController');
const handleValidation = require('../middleware/validate');

const router = express.Router();

const scanValidators = [
  body('deviceSN').trim().notEmpty().withMessage('Device serial number is required'),
  body('deviceName').optional({ values: 'falsy' }).trim(),
  body('machineNumber').isInt({ min: 1 }).withMessage('Machine number is required').toInt(),
  body('userId').isInt({ min: 1 }).withMessage('User ID is required').toInt(),
  body('timestamp').optional({ values: 'falsy' }).isISO8601().withMessage('Timestamp must be valid'),
  body('verifyMode').optional({ values: 'falsy' }).trim(),
  handleValidation,
];

const heartbeatValidators = [
  body('deviceSN').trim().notEmpty().withMessage('Device serial number is required'),
  body('deviceName').optional({ values: 'falsy' }).trim(),
  body('machineNumber').isInt({ min: 1 }).withMessage('Machine number is required').toInt(),
  handleValidation,
];

router.post('/scan', scanValidators, processFingerprintScan);
router.post('/heartbeat', heartbeatValidators, processFingerprintHeartbeat);

module.exports = router;
