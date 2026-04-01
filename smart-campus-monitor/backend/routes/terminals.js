const express = require('express');
const { body, param } = require('express-validator');
const {
  getTerminals,
  getTerminalStatus,
  createTerminal,
  updateTerminal,
  deleteTerminal,
  getTerminalLogs,
} = require('../controllers/terminalController');
const { protect, authorize } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');
const TerminalConfig = require('../models/TerminalConfig');

const router = express.Router();

const machineNumberValidation = param('machineNumber')
  .isInt({ min: 1 })
  .withMessage('Machine number must be a positive integer')
  .toInt();

const terminalValidators = [
  body('machineNumber')
    .isInt({ min: 1 })
    .withMessage('Machine number must be a positive integer')
    .toInt()
    .custom((value) => {
      if (!TerminalConfig.isValidMachineNumber(value)) {
        throw new Error(
          'Machine number must be 50 for enrollment or follow the gate convention like 101-104, 201-204, 301-304'
        );
      }
      return true;
    }),
  body('deviceSN').trim().notEmpty().withMessage('Device serial number is required'),
  body('deviceName').optional({ values: 'falsy' }).trim(),
  body('gateName').trim().notEmpty().withMessage('Gate name is required'),
  body('terminalLabel').optional({ values: 'falsy' }).trim(),
  body('location').optional({ values: 'falsy' }).trim(),
  body('terminalIP')
    .optional({ values: 'falsy' })
    .trim()
    .isIP()
    .withMessage('Terminal IP must be a valid IP address'),
  handleValidation,
];

const terminalUpdateValidators = [
  machineNumberValidation,
  body('deviceSN').trim().notEmpty().withMessage('Device serial number is required'),
  body('deviceName').optional({ values: 'falsy' }).trim(),
  body('gateName').trim().notEmpty().withMessage('Gate name is required'),
  body('terminalLabel').optional({ values: 'falsy' }).trim(),
  body('location').optional({ values: 'falsy' }).trim(),
  body('terminalIP')
    .optional({ values: 'falsy' })
    .trim()
    .isIP()
    .withMessage('Terminal IP must be a valid IP address'),
  handleValidation,
];

router.get('/', protect, authorize('admin', 'security'), getTerminals);
router.get('/status', protect, authorize('admin', 'security'), getTerminalStatus);
router.get(
  '/:machineNumber/logs',
  protect,
  authorize('admin', 'security'),
  machineNumberValidation,
  handleValidation,
  getTerminalLogs
);
router.post('/', protect, authorize('admin'), terminalValidators, createTerminal);
router.put(
  '/:machineNumber',
  protect,
  authorize('admin'),
  terminalUpdateValidators,
  updateTerminal
);
router.delete(
  '/:machineNumber',
  protect,
  authorize('admin'),
  machineNumberValidation,
  handleValidation,
  deleteTerminal
);

module.exports = router;
