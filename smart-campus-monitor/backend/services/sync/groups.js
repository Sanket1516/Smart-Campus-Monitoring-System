/**
 * Terminal groups. A terminal belongs to groups (e.g. "gate", "hostel:<id>");
 * a student targets groups. A student is provisioned on every enabled gate-role
 * terminal that shares at least one group. Pure functions.
 */
const { getSyncConfig } = require('../../config/terminalSync');

const normalize = (values) =>
  Array.from(new Set((values || []).map((v) => String(v).trim().toLowerCase()).filter(Boolean)));

const hostelGroup = (hostelId) => `${getSyncConfig().groups.hostelGroupPrefix}${String(hostelId)}`;

const terminalGroups = (terminal) => {
  if (!terminal) return [];
  if (Array.isArray(terminal.groups) && terminal.groups.length) return normalize(terminal.groups);
  if (terminal.isEnrollmentStation || terminal.role === 'enrollment') return ['enrollment'];
  if (terminal.terminalType === 'HOSTEL' && terminal.hostel) {
    return [hostelGroup(terminal.hostel._id || terminal.hostel)];
  }
  return ['gate'];
};

const isHostellerStudent = (student) =>
  student?.studentType === 'hosteller' || student?.isHosteller === true || student?.category === 'hostellers';

const studentGroups = (student) => {
  if (!student) return [];
  if (Array.isArray(student.targetTerminalGroups) && student.targetTerminalGroups.length) {
    return normalize(student.targetTerminalGroups);
  }
  const groups = [...getSyncConfig().groups.defaultStudentGroups];
  if (isHostellerStudent(student) && student.hostel) {
    groups.push(hostelGroup(student.hostel._id || student.hostel));
  }
  return normalize(groups);
};

const isGateTerminal = (terminal) =>
  terminal && terminal.enabled !== false && !terminal.isEnrollmentStation && terminal.role !== 'enrollment';

const isEnrollmentTerminal = (terminal) =>
  terminal && terminal.enabled !== false && (terminal.isEnrollmentStation || terminal.role === 'enrollment');

const intersects = (a, b) => {
  const set = new Set(a);
  return b.some((value) => set.has(value));
};

const desiredTerminalsForStudent = (student, terminals) => {
  const groups = studentGroups(student);
  return (terminals || []).filter((terminal) => isGateTerminal(terminal) && intersects(groups, terminalGroups(terminal)));
};

const isStudentEligible = (student) =>
  Boolean(student) && student.isActive !== false && student.accessStatus !== 'blocked';

module.exports = {
  normalize,
  hostelGroup,
  terminalGroups,
  studentGroups,
  isGateTerminal,
  isEnrollmentTerminal,
  desiredTerminalsForStudent,
  isStudentEligible,
  intersects,
};
