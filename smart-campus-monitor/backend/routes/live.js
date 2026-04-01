const express = require('express');
const { getPublicLiveDashboard } = require('../controllers/liveController');

const router = express.Router();

router.get('/', getPublicLiveDashboard);

module.exports = router;
