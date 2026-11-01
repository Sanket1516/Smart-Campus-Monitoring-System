const express = require('express');
const router = express.Router();
const bulk = require('../controllers/studentBulkController');
const { protect, authorize } = require('../middleware/auth');

// Administrator-only: security guards and wardens cannot bulk-enroll students.
router.use(protect, authorize('admin'));

router.get('/template', bulk.downloadTemplate);
router.post('/validate', bulk.validate);
router.get('/:id', bulk.getStatus);
router.get('/:id/rows', bulk.getRows);
router.get('/:id/report', bulk.report);
router.post('/:id/confirm', bulk.confirm);
router.delete('/:id', bulk.cancel);

module.exports = router;
