const { body, validationResult } = require('express-validator');
const EntryLog = require('../models/EntryLog');
const UnauthorizedLog = require('../models/UnauthorizedLog');
const Student = require('../models/Student');
const { classifyIntent } = require('../services/aiIntentService');
const { routeMessage } = require('../services/formFillService');
const { buildSnapshot, answerWithData } = require('../services/campusQaService');
const { resolveAssignedHostel } = require('../services/wardenScopeService');
const { isHosteller } = require('../utils/studentMeta');

const formatDateLocal = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayDate = () => formatDateLocal();

const getAccessibleSapIds = async (admin) => {
  if (admin.role !== 'warden') {
    return null;
  }

  const assignedHostel = await resolveAssignedHostel(admin);
  if (!assignedHostel?._id) {
    return [];
  }

  const students = await Student.find({
    hostel: assignedHostel._id,
    isActive: true,
  })
    .select('sapId')
    .lean();

  return students.map((student) => student.sapId);
};

const getTodayLogsScoped = async (admin) => {
  const date = getTodayDate();
  const sapIds = await getAccessibleSapIds(admin);

  if (Array.isArray(sapIds) && sapIds.length === 0) {
    return [];
  }

  const filter = { date };
  if (Array.isArray(sapIds)) {
    filter.sapId = { $in: sapIds };
  }

  return EntryLog.find(filter).sort({ createdAt: -1 }).lean();
};

const getUnauthorizedCountScoped = async (admin) => {
  if (admin.role === 'warden') {
    return 0;
  }
  return UnauthorizedLog.countDocuments({ date: getTodayDate() });
};

const getSnapshot = async (admin) => {
  const sapIds = await getAccessibleSapIds(admin);
  const filter = { isActive: true };
  if (Array.isArray(sapIds)) filter.sapId = { $in: sapIds };
  const [students, logs, unauthorizedToday] = await Promise.all([
    Student.find(filter).select('sapId name category department year hostel accessStatus').populate('hostel', 'name').lean(),
    getTodayLogsScoped(admin),
    admin.role === 'warden' ? Promise.resolve(null) : UnauthorizedLog.countDocuments({ date: getTodayDate() }),
  ]);
  return buildSnapshot({ students, logs, unauthorizedToday, date: getTodayDate() });
};

// Cheap pre-check so ordinary questions need only one Gemini call.
const looksLikeFormFill = (text) =>
  /(add|register|enrol+|enroll|create|new)[^.]*student/i.test(text) || /sap[^.]*\d{9,}/i.test(text);

const buildTotalInsideAnswer = async (admin) => {
  const logs = await getTodayLogsScoped(admin);
  const latestBySapId = new Map();

  for (const log of logs) {
    if (!latestBySapId.has(log.sapId)) {
      latestBySapId.set(log.sapId, log);
    }
  }

  let inside = 0;
  for (const log of latestBySapId.values()) {
    if (log.status === 'entered') inside += 1;
  }

  return `Students currently inside: ${inside}`;
};

const buildInsideNamesAnswer = async (admin) => {
  const logs = await getTodayLogsScoped(admin);
  const latestBySapId = new Map();
  for (const log of logs) {
    if (!latestBySapId.has(log.sapId)) latestBySapId.set(log.sapId, log);
  }
  const inside = Array.from(latestBySapId.values()).filter((log) => log.status === 'entered');
  if (inside.length === 0) return 'No students are currently inside.';
  const names = inside.slice(0, 25).map((log) => `${log.studentName} (${log.sapId})`).join(', ');
  const extra = inside.length > 25 ? ` and ${inside.length - 25} more` : '';
  return `Students currently inside (${inside.length}): ${names}${extra}`;
};

const buildLateReturnsTodayAnswer = async (admin) => {
  const logs = await getTodayLogsScoped(admin);
  const lateLogs = logs.filter((log) => log.lateReturn);

  if (lateLogs.length === 0) {
    return 'No late returns today.';
  }

  const lateBySapId = new Map();
  for (const log of lateLogs) {
    if (!lateBySapId.has(log.sapId)) {
      lateBySapId.set(log.sapId, log);
    }
  }

  const summary = Array.from(lateBySapId.values())
    .slice(0, 10)
    .map((log) => `${log.studentName} (${log.sapId})`)
    .join(', ');

  const extra = lateBySapId.size > 10 ? ` and ${lateBySapId.size - 10} more` : '';
  return `Late returns today: ${lateBySapId.size}. ${summary}${extra}`;
};

const buildHostellersOutsideAnswer = async (admin) => {
  const logs = await getTodayLogsScoped(admin);
  const latestHostellerLogBySapId = new Map();

  for (const log of logs) {
    if (isHosteller(log.category) && !latestHostellerLogBySapId.has(log.sapId)) {
      latestHostellerLogBySapId.set(log.sapId, log);
    }
  }

  const outside = Array.from(latestHostellerLogBySapId.values()).filter(
    (log) => log.status === 'exited'
  );

  if (outside.length === 0) {
    return 'No hostellers are currently outside.';
  }

  const summary = outside
    .slice(0, 10)
    .map((log) => `${log.studentName} (${log.sapId})`)
    .join(', ');
  const extra = outside.length > 10 ? ` and ${outside.length - 10} more` : '';

  return `Hostellers currently outside: ${outside.length}. ${summary}${extra}`;
};

const buildUnauthorizedTodayAnswer = async (admin) => {
  const count = await getUnauthorizedCountScoped(admin);
  return `Unauthorized attempts today: ${count}`;
};

const answerByIntent = async (intent, admin) => {
  if (intent === 'total_inside') return buildTotalInsideAnswer(admin);
  if (intent === 'students_inside_names') return buildInsideNamesAnswer(admin);
  if (intent === 'late_returns_today') return buildLateReturnsTodayAnswer(admin);
  if (intent === 'hostellers_outside') return buildHostellersOutsideAnswer(admin);
  if (intent === 'unauthorized_today') return buildUnauthorizedTodayAnswer(admin);
  return 'Unable to classify query. Please ask about students inside (count or names), late returns today, hostellers outside, or unauthorized attempts today.';
};

const aiQueryValidators = [
  body('message')
    .isString()
    .withMessage('message must be a string')
    .trim()
    .isLength({ min: 3, max: 300 })
    .withMessage('message must be between 3 and 300 characters'),
];

const aiQuery = async (req, res) => {
  const validation = validationResult(req);
  if (!validation.isEmpty()) {
    return res.status(400).json({
      message: validation
        .array()
        .map((entry) => entry.msg)
        .join(', '),
    });
  }

  const message = String(req.body.message || '').trim();
  const startedAt = Date.now();
  let intent = 'unknown';

  // Smart form filling (Gemini extracts + we validate). Only attempted for registration-style messages.
  const routed = looksLikeFormFill(message) ? await routeMessage(message) : null;
  if (routed?.intent === 'fill_student_form') {
    if (req.admin.role !== 'admin') {
      return res.json({ intent: 'fill_student_form', answer: 'Only administrators can register students.' });
    }
    const filled = Object.keys(routed.student).length;
    const answer = filled
      ? `I filled ${filled} field${filled === 1 ? '' : 's'} from your message.` +
        (routed.missing.length ? ` Still needed: ${routed.missing.join(', ')}.` : ' Review and save the form.')
      : 'I could not find any student details in that message. Include name, SAP ID, email, course and category.';
    return res.json({
      intent: 'fill_student_form',
      answer,
      formFill: filled ? { form: 'student', fields: routed.student, missing: routed.missing } : null,
      meta: { latencyMs: Date.now() - startedAt, engine: 'gemini' },
    });
  }

  // Free-form questions: Gemini answers from a role-scoped snapshot of today's real data.
  try {
    const snapshot = await getSnapshot(req.admin);
    const llmAnswer = await answerWithData({ message, history: req.body.history, snapshot });
    if (llmAnswer) {
      return res.json({ intent: 'data_qa', answer: llmAnswer, meta: { latencyMs: Date.now() - startedAt, engine: 'gemini' } });
    }
  } catch (error) {
    console.warn('Data Q&A failed:', error.message);
  }

  // Fallback when Gemini is unavailable: built-in keyword intents.
  try {
    intent = await classifyIntent(message);
  } catch (_error) {
    intent = 'unknown';
  }

  const answer = await answerByIntent(intent, req.admin);

  return res.json({
    intent,
    answer,
    meta: {
      latencyMs: Date.now() - startedAt,
    },
  });
};

module.exports = {
  aiQuery,
  aiQueryValidators,
};

