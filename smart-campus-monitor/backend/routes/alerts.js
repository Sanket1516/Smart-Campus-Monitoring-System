const express = require('express');
const { body } = require('express-validator');
const { getAlerts, markAlertsRead } = require('../controllers/alertController');
const { protect, authorize } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

router.get('/', protect, authorize('admin', 'warden', 'security'), getAlerts);
router.post(
  '/read',
  protect,
  authorize('admin', 'warden', 'security'),
  [body('alertIds').optional().isArray().withMessage('alertIds must be an array'), handleValidation],
  markAlertsRead
);

module.exports = router;
