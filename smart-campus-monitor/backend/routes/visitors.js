const express = require('express');
const router = express.Router();
const {
  createVisitorEntry,
  getVisitorEntries,
} = require('../controllers/visitorController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getVisitorEntries);
router.post('/', protect, createVisitorEntry);

module.exports = router;
