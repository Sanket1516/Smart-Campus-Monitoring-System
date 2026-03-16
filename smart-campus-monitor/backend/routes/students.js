const express = require('express');
const router = express.Router();
const {
  getStudentBySapId,
  getAllStudents,
  createStudent,
  updateStudent,
  deleteStudent,
} = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, getAllStudents);
router.get('/:sapId', protect, getStudentBySapId);
router.post('/', protect, authorize('admin'), createStudent);
router.put('/:sapId', protect, authorize('admin'), updateStudent);
router.delete('/:sapId', protect, authorize('admin'), deleteStudent);

module.exports = router;
