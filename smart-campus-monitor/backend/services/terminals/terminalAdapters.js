/**
 * Role adapters for the three-device architecture.
 *
 *  ADMIN_ENROLLMENT  enrolment (menu capture, template retrieval)
 *  GATE_ENTRY        receives users/templates, sends ENTRY punches
 *  GATE_EXIT         receives users/templates, sends EXIT punches
 *
 * Each operation carries an honest capability state:
 *   verified    proven on the X990 in the pilot (set via HARDWARE_CAPABILITIES)
 *   unverified  implemented from the open protocol, not yet proven on an X990
 *   disabled    implemented but switched off (e.g. remote enrolment)
 *   unsupported switched off because the pilot showed it does not work
 * Operations marked "unsupported" are skipped instead of silently reported as successful.
 */
const { getSyncConfig } = require('../../config/terminalSync');

const parseOverrides = () => {
  try {
    return JSON.parse(process.env.HARDWARE_CAPABILITIES || '{}');
  } catch (_error) {
    throw new Error('HARDWARE_CAPABILITIES must be JSON, e.g. {"template_readback_push":"unsupported"}');
  }
};

const OPERATIONS = {
  ADMIN_ENROLLMENT: {
    menu_enrollment: 'Person enrols on the device menu under the PIN created by the backend',
    template_upload_push: 'Device uploads the new template over push (OPERLOG/FINGERTMP/BIODATA)',
    template_read_sidecar: 'Backend reads the template over ZK TCP (sidecar get_user_template)',
    remote_enroll_push: 'ENROLL_FP command over push',
    remote_enroll_pyzk: 'pyzk enroll_user via the sidecar',
    user_write_push: 'DATA UPDATE USERINFO over push',
    user_delete_push: 'DATA DELETE USERINFO over push (de-enrolment)',
  },
  GATE: {
    user_write_push: 'DATA UPDATE USERINFO over push',
    template_write_push: 'DATA UPDATE FINGERTMP / biodata over push',
    user_delete_push: 'DATA DELETE USERINFO over push',
    template_readback_push: 'DATA QUERY FINGERTMP over push; device uploads the template for comparison',
    template_readback_sidecar: 'Read the template back over ZK TCP and compare SHA-256',
    attendance_push: 'Real-time ATTLOG over push',
    attendance_pull: 'Attendance pulled over ZK TCP by the sidecar (zk_tcp_pull terminals)',
  },
};

const defaultState = (operation) => {
  const { enrollment } = getSyncConfig();
  if (operation === 'remote_enroll_push') return enrollment.pushRemoteEnabled ? 'unverified' : 'disabled';
  if (operation === 'remote_enroll_pyzk') return enrollment.pyzkRemoteEnabled ? 'unverified' : 'disabled';
  return 'unverified';
};

const capabilitiesFor = (terminal) => {
  const group = terminal?.deviceRole === 'ADMIN_ENROLLMENT' ? 'ADMIN_ENROLLMENT' : 'GATE';
  const overrides = parseOverrides();
  return Object.entries(OPERATIONS[group]).map(([operation, description]) => ({
    operation,
    description,
    state: overrides[operation] || defaultState(operation),
  }));
};

const capabilityState = (terminal, operation) =>
  capabilitiesFor(terminal).find((c) => c.operation === operation)?.state || 'unsupported';

const isUsable = (terminal, operation) => !['unsupported', 'disabled'].includes(capabilityState(terminal, operation));

const getTerminalAdapter = (terminal) => {
  const role = terminal?.deviceRole || 'GATE_TOGGLE';
  return {
    role,
    protocol: terminal?.communicationProtocol || 'adms_push',
    simulated: Boolean(terminal?.simulated),
    isEnrollment: role === 'ADMIN_ENROLLMENT',
    attendanceDirection: role === 'GATE_ENTRY' ? 'entry' : role === 'GATE_EXIT' ? 'exit' : role === 'GATE_TOGGLE' ? 'toggle' : null,
    capabilities: capabilitiesFor(terminal),
    can: (operation) => isUsable(terminal, operation),
  };
};

module.exports = { getTerminalAdapter, capabilitiesFor, capabilityState, isUsable, OPERATIONS };
