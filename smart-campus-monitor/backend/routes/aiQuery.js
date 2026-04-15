const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { aiQuery, aiQueryValidators } = require('../controllers/aiQueryController');

router.post('/', protect, aiQueryValidators, aiQuery);

module.exports = router;

