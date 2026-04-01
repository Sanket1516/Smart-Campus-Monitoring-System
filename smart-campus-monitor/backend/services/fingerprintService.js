const syncAllStudentsToNewTerminal = async (terminalIP) => {
  if (!terminalIP) {
    return { success: false, skipped: true, reason: 'Terminal IP not provided' };
  }

  // Feature 10 only needs registration to trigger sync. The actual biometric
  // sync implementation arrives with the fingerprint integration work.
  return { success: false, skipped: true, reason: 'Fingerprint sync not implemented yet' };
};

module.exports = {
  syncAllStudentsToNewTerminal,
};
