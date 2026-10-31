const express = require('express');
const { getPublicLiveDashboard, getPublicBranding } = require('../controllers/liveController');

const router = express.Router();

router.get('/', getPublicLiveDashboard);
router.get('/branding', getPublicBranding);

module.exports = router;
