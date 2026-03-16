const express = require('express');
const router = express.Router();
const { processScan } = require('../controllers/scanController');
const { protect } = require('../middleware/auth');

router.post('/', protect, processScan);

module.exports = router;
