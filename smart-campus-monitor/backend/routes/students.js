const express = require('express');
const router = express.Router();
const {
  getStudentBySapId,
  getAllStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  uploadStudentsExcel,
} = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, getAllStudents);
router.get('/:sapId', protect, getStudentBySapId);
router.post('/', protect, authorize('admin'), createStudent);
router.post('/upload', protect, authorize('admin'), uploadStudentsExcel);
router.put('/:sapId', protect, authorize('admin'), updateStudent);
router.delete('/:sapId', protect, authorize('admin'), deleteStudent);

module.exports = router;
