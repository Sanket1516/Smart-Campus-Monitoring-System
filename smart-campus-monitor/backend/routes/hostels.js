const express = require('express');
const { body, param } = require('express-validator');
const {
  getHostels,
  getHostelById,
  createHostel,
  updateHostel,
  deleteHostel,
  getHostelStudents,
} = require('../controllers/hostelController');
const { protect, authorize } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

const hostelValidators = [
  body('name').trim().notEmpty().withMessage('Hostel name is required'),
  body('code').optional({ values: 'falsy' }).trim(),
  body('type')
    .isIn(['boys', 'girls', 'mixed'])
    .withMessage('Hostel type must be boys, girls, or mixed'),
  body('totalRooms')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('Total rooms must be a non-negative number')
    .toInt(),
  body('capacity')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .withMessage('Capacity must be a non-negative number')
    .toInt(),
  body('warden').isMongoId().withMessage('Valid warden id is required'),
  body('wardenPhone').optional({ values: 'falsy' }).trim(),
  body('wardenEmail').optional({ values: 'falsy' }).isEmail().withMessage('Warden email must be valid'),
  body('location').optional({ values: 'falsy' }).trim(),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false').toBoolean(),
  handleValidation,
];

router.get('/', protect, authorize('admin'), getHostels);
router.get(
  '/:id',
  protect,
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid hostel id'), handleValidation],
  getHostelById
);
router.get(
  '/:id/students',
  protect,
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid hostel id'), handleValidation],
  getHostelStudents
);
router.post('/', protect, authorize('admin'), hostelValidators, createHostel);
router.put(
  '/:id',
  protect,
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid hostel id'), ...hostelValidators],
  updateHostel
);
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid hostel id'), handleValidation],
  deleteHostel
);

module.exports = router;
