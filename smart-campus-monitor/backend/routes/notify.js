const express = require('express');
const router = express.Router();
const { notifyParent } = require('../services/notification');
const Student = require('../models/Student');
const { protect } = require('../middleware/auth');

// POST /api/notify - manually trigger notification
router.post('/', protect, async (req, res) => {
  try {
    const { sapId, action } = req.body;

    const student = await Student.findOne({ sapId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const results = await notifyParent(student, action || 'entry', new Date());
    res.json({ message: 'Notification sent', results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
