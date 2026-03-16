const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getHourlyDistribution,
  getHostellerStatus,
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getDashboardStats);
router.get('/hourly', protect, getHourlyDistribution);
router.get('/hostellers', protect, getHostellerStatus);

module.exports = router;
