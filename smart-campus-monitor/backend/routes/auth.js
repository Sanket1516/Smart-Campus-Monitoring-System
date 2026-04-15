const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const {
  login,
  getMe,
  register,
  getStaff,
  updateStaff,
  deactivateStaff,
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

router.post('/login', login);
router.get('/me', protect, getMe);
router.get('/staff', protect, authorize('admin'), getStaff);
router.post(
  '/register',
  protect,
  authorize('admin'),
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('Email must be valid'),
    body('phone').optional({ values: 'falsy' }).trim(),
    body('role')
      .isIn(['admin', 'warden', 'security'])
      .withMessage('Role must be admin, warden, or security'),
    body('hostelId').optional({ values: 'falsy' }).isMongoId().withMessage('Hostel must be valid'),
    handleValidation,
  ],
  register
);
router.put(
  '/staff/:id',
  protect,
  authorize('admin'),
  [
    param('id').isMongoId().withMessage('Invalid staff id'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('Email must be valid'),
    body('phone').optional({ values: 'falsy' }).trim(),
    body('role')
      .isIn(['admin', 'warden', 'security'])
      .withMessage('Role must be admin, warden, or security'),
    body('hostelId').optional({ values: 'falsy' }).isMongoId().withMessage('Hostel must be valid'),
    handleValidation,
  ],
  updateStaff
);
router.delete(
  '/staff/:id',
  protect,
  authorize('admin'),
  [param('id').isMongoId().withMessage('Invalid staff id'), handleValidation],
  deactivateStaff
);

module.exports = router;
