/**
 * Map a terminal list (from /api/live, /api/terminals or /api/sync/terminals) to
 * { admin, entry, exit } = 'online' | 'offline' | 'missing'. Uses the registered
 * deviceRole only; never guesses a role from a name.
 */
export const roleStatusFromTerminals = (terminals) => {
  if (!Array.isArray(terminals)) return null;
  const pick = (role) => {
    const list = terminals.filter((t) => t.deviceRole === role && t.enabled !== false);
    if (!list.length) return 'missing';
    return list.some((t) => t.isOnline ?? t.online) ? 'online' : 'offline';
  };
  return { admin: pick('ADMIN_ENROLLMENT'), entry: pick('GATE_ENTRY'), exit: pick('GATE_EXIT') };
};
