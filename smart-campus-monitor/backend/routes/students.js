const express = require('express');
const { body, param } = require('express-validator');
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
const handleValidation = require('../middleware/validate');

const studentValidators = [
  body('sapId').trim().notEmpty().withMessage('SAP ID is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Email must be valid'),
  body('category')
    .trim()
    .isIn(['dayscholars', 'day_scholar', 'hostellers', 'hosteller'])
    .withMessage('Category must be day scholar or hosteller'),
  body('course')
    .trim()
    .isIn(['pharmacy', 'engineering', 'mbatech', 'pharmatech'])
    .withMessage('Course is invalid'),
  body('department').trim().notEmpty().withMessage('Department is required'),
  body('year').optional({ values: 'falsy' }).isInt({ min: 1, max: 5 }).withMessage('Year must be between 1 and 5'),
  body('phone').optional({ values: 'falsy' }).trim(),
  body('parentEmail').optional({ values: 'falsy' }).isEmail().withMessage('Parent email must be valid'),
  body('parentPhone').optional({ values: 'falsy' }).trim(),
  body('address').optional({ values: 'falsy' }).trim(),
  body('bloodGroup').optional({ values: 'falsy' }).trim(),
  body('hostel').optional({ values: 'falsy' }).isMongoId().withMessage('Hostel must be valid'),
  body('roomNumber').optional({ values: 'falsy' }).trim(),
  handleValidation,
];

router.get('/', protect, getAllStudents);
router.get('/:sapId', protect, getStudentBySapId);
router.post('/', protect, authorize('admin'), studentValidators, createStudent);
router.post('/upload', protect, authorize('admin'), uploadStudentsExcel);
router.put(
  '/:sapId',
  protect,
  authorize('admin'),
  [param('sapId').trim().notEmpty().withMessage('SAP ID is required'), ...studentValidators],
  updateStudent
);
router.delete(
  '/:sapId',
  protect,
  authorize('admin'),
  [param('sapId').trim().notEmpty().withMessage('SAP ID is required'), handleValidation],
  deleteStudent
);

module.exports = router;
