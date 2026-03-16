const express = require('express');
const router = express.Router();
const {
  getLogs,
  getUnauthorizedLogs,
  resolveUnauthorized,
} = require('../controllers/logController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getLogs);
router.get('/unauthorized', protect, getUnauthorizedLogs);
router.put('/unauthorized/:id/resolve', protect, resolveUnauthorized);

module.exports = router;
