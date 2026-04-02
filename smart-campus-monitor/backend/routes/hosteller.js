const express = require('express');
const { body, param } = require('express-validator');
const {
  createHostellerRequest,
  getHostellerRequests,
  approveHostellerRequest,
  rejectHostellerRequest,
  getActiveHostellerRequests,
  getStudentHostellerHistory,
  getHostelHostellerRequests,
  getPublicStudentRequestStatus,
  studentLogin,
} = require('../controllers/hostellerController');
const { protect, authorize } = require('../middleware/auth');
const { authenticateStudent } = require('../middleware/studentAuth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

router.post(
  '/student/login',
  [
    body('username').trim().notEmpty().withMessage('Name is required'),
    body('password').trim().notEmpty().withMessage('Phone number is required'),
    handleValidation,
    authenticateStudent,
  ],
  studentLogin
);

router.get(
  '/public/:sapId',
  [param('sapId').trim().notEmpty().withMessage('SAP ID is required'), handleValidation],
  getPublicStudentRequestStatus
);

router.post(
  '/request',
  [
    body('username').trim().notEmpty().withMessage('Name is required'),
    body('password').trim().notEmpty().withMessage('Phone number is required'),
    body('reason').trim().notEmpty().withMessage('Reason is required'),
    body('requestedExitTime').optional({ values: 'falsy' }).isISO8601().withMessage('Requested exit time must be valid'),
    body('expectedReturnTime').isISO8601().withMessage('Expected return time must be valid'),
    handleValidation,
    authenticateStudent,
  ],
  createHostellerRequest
);

router.get('/requests', protect, authorize('admin', 'warden'), getHostellerRequests);
router.post(
  '/approve/:requestId',
  protect,
  authorize('admin', 'warden'),
  [param('requestId').isMongoId().withMessage('Invalid request id'), handleValidation],
  approveHostellerRequest
);
router.post(
  '/reject/:requestId',
  protect,
  authorize('admin', 'warden'),
  [
    param('requestId').isMongoId().withMessage('Invalid request id'),
    body('rejectionReason').trim().notEmpty().withMessage('Rejection reason is required'),
    handleValidation,
  ],
  rejectHostellerRequest
);
router.get('/active', protect, authorize('admin', 'warden'), getActiveHostellerRequests);
router.get(
  '/history/:studentId',
  protect,
  authorize('admin', 'warden'),
  [param('studentId').isMongoId().withMessage('Invalid student id'), handleValidation],
  getStudentHostellerHistory
);
router.get(
  '/hostel/:hostelId',
  protect,
  authorize('admin', 'warden'),
  [param('hostelId').isMongoId().withMessage('Invalid hostel id'), handleValidation],
  getHostelHostellerRequests
);

module.exports = router;
