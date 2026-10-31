/** Single-instance device roles (UNIQUE_DEVICE_ROLES, default the three-device set). */
const uniqueRoles = () =>
  String(process.env.UNIQUE_DEVICE_ROLES ?? 'ADMIN_ENROLLMENT,GATE_ENTRY,GATE_EXIT')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);

/** Throws (statusCode 409) if another enabled terminal already has this unique role. */
const assertDeviceRoleAvailable = async (TerminalModel, { _id = null, deviceRole, enabled = true }) => {
  if (!uniqueRoles().includes(deviceRole) || enabled === false) return true;
  const clash = await TerminalModel.findOne({ deviceRole, enabled: { $ne: false }, ...(_id ? { _id: { $ne: _id } } : {}) })
    .select('deviceSN terminalLabel')
    .lean();
  if (clash) {
    const error = new Error(`Role ${deviceRole} is already assigned to ${clash.terminalLabel || clash.deviceSN} (${clash.deviceSN})`);
    error.statusCode = 409;
    throw error;
  }
  return true;
};

module.exports = { uniqueRoles, assertDeviceRoleAvailable };
