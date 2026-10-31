const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query } = require('express-validator');
const c = require('../controllers/syncController');
const { protect, authorize } = require('../middleware/auth');
const handleValidation = require('../middleware/validate');

const router = express.Router();

const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.SYNC_API_MUTATION_LIMIT_PER_MIN || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sync requests, please slow down' },
});

const adminOnly = [protect, authorize('admin')];
const adminWrite = [protect, authorize('admin'), mutationLimiter];
const readScoped = [protect, authorize('admin', 'warden')];

const sn = param('sn').trim().matches(/^[A-Za-z0-9_-]{1,64}$/).withMessage('Invalid serial number');
const studentId = param('id').isMongoId().withMessage('Invalid student id');
const groupList = (field) =>
  body(field)
    .isArray({ max: 20 })
    .withMessage(`${field} must be an array`)
    .custom((values) => values.every((v) => /^[a-z0-9:_-]{1,64}$/i.test(String(v))))
    .withMessage('Group names may contain letters, digits, ":", "_" and "-" only');

router.get('/overview', readScoped, c.getOverview);
router.get('/terminals', readScoped, c.listTerminals);
router.patch(
  '/terminals/:sn',
  adminWrite,
  [
    sn,
    groupList('groups').optional(),
    body('enabled').optional().isBoolean(),
    body('dialect').optional().isIn(['classic', 'v3', 'unknown']),
    body('commKeySet').optional().isBoolean(),
    body('tlsSupported').optional({ nullable: true }).isBoolean(),
    handleValidation,
  ],
  c.updateTerminal
);
router.post('/terminals/:sn/resync', adminWrite, [sn, body('mode').optional().isIn(['auto', 'push', 'sidecar']), handleValidation], c.resyncTerminal);
router.post('/terminals/:sn/probe', adminWrite, [sn, handleValidation], c.probeTerminal);
router.get('/terminals/:sn/info', adminOnly, [sn, handleValidation], c.terminalInfo);
router.post('/terminals/:sn/backup', adminWrite, [sn, handleValidation], c.backupTerminal);

router.get('/groups', readScoped, c.listGroups);
router.put(
  '/groups/:group/terminals',
  adminWrite,
  [
    param('group').matches(/^[a-z0-9:_-]{1,64}$/i).withMessage('Invalid group'),
    body('terminalSNs').isArray({ max: 500 }),
    handleValidation,
  ],
  c.setGroupTerminals
);

router.get('/enrollment/methods', adminOnly, c.listEnrollmentMethods);
router.get('/students/:id', readScoped, [studentId, handleValidation], c.getStudentSync);
router.patch('/students/:id/groups', adminWrite, [studentId, groupList('targetTerminalGroups'), handleValidation], c.setStudentGroups);
router.post('/students/:id/resync', adminWrite, [studentId, handleValidation], c.resyncStudent);
router.post(
  '/students/:id/consent',
  adminWrite,
  [
    studentId,
    body('isMinor').isBoolean().withMessage('isMinor is required').toBoolean(),
    body('givenBy').isIn(['self', 'parent', 'guardian']),
    body('giverName').trim().notEmpty().isLength({ max: 120 }),
    body('giverContact').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
    body('method').optional().isIn(['paper', 'electronic']),
    body('documentRef').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
    body('noticeVersion').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
    handleValidation,
  ],
  c.recordStudentConsent
);
router.delete('/students/:id/consent', adminWrite, [studentId, body('reason').optional().trim().isLength({ max: 300 }), handleValidation], c.withdrawStudentConsent);
router.post(
  '/students/:id/erase',
  adminWrite,
  [studentId, body('confirmSapId').trim().notEmpty(), body('reason').optional().trim().isLength({ max: 300 }), handleValidation],
  c.eraseStudentBiometrics
);
router.post(
  '/students/:id/enrollment/start',
  adminWrite,
  [
    studentId,
    body('method').optional().isIn(['menu', 'pyzk_remote', 'push_remote']),
    groupList('targetGroups').optional(),
    body('fingerIndex').optional().isInt({ min: 0, max: 9 }).toInt(),
    body('terminalSN').optional().trim().matches(/^[A-Za-z0-9_-]{1,64}$/),
    handleValidation,
  ],
  c.startEnrollment
);
router.post(
  '/students/:id/enrollment/fetch',
  adminWrite,
  [studentId, body('terminalSN').optional().trim().matches(/^[A-Za-z0-9_-]{1,64}$/), handleValidation],
  c.fetchEnrollmentTemplate
);
router.get('/students/:id/enrollment', adminOnly, [studentId, handleValidation], c.getEnrollmentStatus);

router.get(
  '/commands',
  adminOnly,
  [
    query('status').optional().isIn(['pending', 'sent', 'acked', 'failed', 'cancelled']),
    query('student').optional().isMongoId(),
    query('terminalSN').optional().trim().matches(/^[A-Za-z0-9_-]{1,64}$/),
    handleValidation,
  ],
  c.listCommands
);
router.post(
  '/commands/retry',
  adminWrite,
  [body('ids').optional().isArray({ max: 1000 }), body('ids.*').optional().isMongoId(), body('terminalSN').optional().trim(), handleValidation],
  c.retryCommands
);
router.post('/commands/:id/cancel', adminWrite, [param('id').isMongoId(), handleValidation], c.cancelCommand);

router.get('/reconciliation', adminOnly, c.listReconciliationReports);
router.post(
  '/reconciliation/run',
  adminWrite,
  [body('source').optional().isIn(['sidecar', 'push', 'state']), body('terminalSNs').optional().isArray({ max: 500 }), handleValidation],
  c.runReconciliationNow
);
router.get('/audit', readScoped, [query('student').optional().isMongoId(), handleValidation], c.listBiometricAudit);
router.get('/jobs', adminOnly, c.listJobs);
router.post('/jobs/:jobId/resume', adminWrite, [param('jobId').matches(/^[A-Za-z0-9_-]{1,80}$/), handleValidation], c.resumeSyncJob);

module.exports = router;
