const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getHourlyDistribution,
  getHostellerStatus,
  getAttendanceStatus,
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getDashboardStats);
router.get('/hourly', protect, getHourlyDistribution);
router.get('/hostellers', protect, getHostellerStatus);
router.get('/attendance', protect, getAttendanceStatus);

module.exports = router;
