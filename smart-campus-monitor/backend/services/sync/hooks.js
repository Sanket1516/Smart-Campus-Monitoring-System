/**
 * Hooks used by existing controllers. Sync failures never undo the primary action
 * (e.g. a block is always saved and enforced in software first); they are reported
 * back and fixed by retries / nightly reconciliation.
 */
const sync = require('./terminalSyncService');

/** Legacy direct node-zklib sync (opens port 4370 from Node). Off by default. */
const legacyDirectSync = () => process.env.LEGACY_ZK_DIRECT_SYNC === 'true';

const eraseOnDeactivate = () => process.env.ERASE_ON_DEACTIVATE !== 'false';

const safely = async (label, fn) => {
  try {
    return { ok: true, result: await fn() };
  } catch (error) {
    console.error(`[sync-hook] ${label} failed:`, error.message);
    return { ok: false, error: error.message };
  }
};

/** Run in the background (bulk operations) without delaying the HTTP response. */
const inBackground = (label, fn) => {
  setImmediate(() => {
    safely(label, fn).then((outcome) => {
      if (outcome.ok && process.env.NODE_ENV !== 'test') {
        console.log(`[sync-hook] ${label} done:`, JSON.stringify(outcome.result).slice(0, 300));
      }
    });
  });
  return { ok: true, background: true };
};

const onStudentCreated = (student, actor) =>
  safely('provision new student', () => sync.enqueueProvision(student, { actor, reason: 'student_created' }));

const onStudentsImported = (studentIds, actor) =>
  inBackground(`provision ${studentIds.length} imported students`, () =>
    sync.enqueueProvisionMany(studentIds, { actor, reason: 'excel_import' })
  );

const onStudentUpdated = (student, actor) =>
  safely('resync updated student', () =>
    student.accessStatus === 'blocked' || student.isActive === false
      ? sync.enqueueDelete(student, { actor, reason: 'student_updated_blocked' })
      : sync.enqueueProvision(student, { actor, reason: 'resync' })
  );

const onStudentBlocked = (student, actor) =>
  safely('delete blocked student from terminals', () => sync.enqueueDelete(student, { actor, reason: 'block' }));

const onStudentsBlocked = (studentIds, actor) =>
  inBackground(`delete ${studentIds.length} blocked students`, () => sync.enqueueDeleteMany(studentIds, { actor, reason: 'block' }));

const onStudentUnblocked = (student, actor) =>
  safely('restore unblocked student', () => sync.enqueueRestore(student, { actor }));

const onStudentsUnblocked = (studentIds, actor) =>
  inBackground(`restore ${studentIds.length} unblocked students`, () => sync.enqueueRestoreMany(studentIds, { actor }));

const onStudentDeactivated = (student, actor) =>
  safely('de-enrol deactivated student', () =>
    eraseOnDeactivate()
      ? sync.deEnrolAndErase(student, { actor, reason: 'student_left' })
      : sync.enqueueDelete(student, { actor, reason: 'student_deactivated' })
  );

const onTerminalCreated = (terminal, actor) =>
  inBackground(`load students onto terminal ${terminal.deviceSN}`, () => sync.enqueueForNewTerminal(terminal, { actor }));

module.exports = {
  legacyDirectSync,
  eraseOnDeactivate,
  onStudentCreated,
  onStudentsImported,
  onStudentUpdated,
  onStudentBlocked,
  onStudentsBlocked,
  onStudentUnblocked,
  onStudentsUnblocked,
  onStudentDeactivated,
  onTerminalCreated,
};
