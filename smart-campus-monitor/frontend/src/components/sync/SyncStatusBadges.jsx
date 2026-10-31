/** Badges for the overall student sync status, per-gate status and SIMULATED data. */
const tone = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
};

const OVERALL = {
  FULLY_SYNCHRONIZED: ['Fully synchronized', 'green'],
  SYNCHRONIZED_UNVERIFIED: ['Stored, not verified', 'blue'],
  PARTIALLY_SYNCHRONIZED: ['Partially synchronized', 'amber'],
  PENDING: ['Sync pending', 'amber'],
  FAILED: ['Sync failed', 'red'],
  BLOCK_PENDING: ['Removal pending', 'amber'],
  BLOCKED_REMOVED: ['Removed from gates', 'gray'],
  NOT_ENROLLED: ['Not enrolled', 'gray'],
  NO_TARGET_TERMINALS: ['No target gates', 'red'],
};

const GATE = {
  verified: ['Synchronized (verified)', 'green'],
  stored: ['Stored (not verified)', 'blue'],
  pending: ['Pending', 'amber'],
  failed: ['Failed', 'red'],
  removed: ['Removed', 'gray'],
  remove_pending: ['Removal pending', 'amber'],
  user_only: ['User only, no fingerprint', 'gray'],
};

const ENROLLMENT = {
  idle: ['Not started', 'gray'],
  waiting_capture: ['Waiting for capture', 'amber'],
  captured: ['Captured', 'green'],
  failed: ['Capture failed', 'red'],
  timeout: ['Timed out', 'red'],
};

const Badge = ({ label, color, title }) => (
  <span title={title} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tone[color] || tone.gray}`}>
    {label}
  </span>
);

export const SyncStatusBadge = ({ status }) => {
  const [label, color] = OVERALL[status] || OVERALL.NOT_ENROLLED;
  return <Badge label={label} color={color} />;
};

export const GateStatusBadge = ({ gate }) => {
  if (!gate) return <Badge label="—" color="gray" />;
  const [label, color] = GATE[gate.status] || [gate.status, 'gray'];
  return <Badge label={label} color={color} title={gate.detail} />;
};

export const EnrollmentStateBadge = ({ state }) => {
  const [label, color] = ENROLLMENT[state] || ENROLLMENT.idle;
  return <Badge label={label} color={color} />;
};

export const SimulatedBadge = ({ show = true }) => (show ? <Badge label="SIMULATED" color="purple" title="Data from a simulated terminal; never sent to real devices" /> : null);

export const ROLE_LABELS = {
  ADMIN_ENROLLMENT: 'Admin Enrollment',
  GATE_ENTRY: 'Gate Entry',
  GATE_EXIT: 'Gate Exit',
  GATE_TOGGLE: 'Gate (entry/exit toggle)',
};

/** Find the gateSync entry for a role (first match). */
export const gateFor = (gateSync, role) => (gateSync || []).find((g) => g.deviceRole === role);
