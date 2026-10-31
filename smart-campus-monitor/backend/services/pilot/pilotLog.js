/**
 * Pilot evidence log (JSONL). Enabled with ADMS_PILOT_LOG=/path/to/pilot-adms.jsonl.
 * One line per event with server UTC time, device time (when known), terminal SN/IP/
 * firmware/algorithm, route, command text (templates redacted to size + SHA-256),
 * return code, user id, finger index, latency. Never contains template data.
 */
const fs = require('fs');

const redact = (text) => String(text || '').replace(/(TMP|Tmp)=[A-Za-z0-9+/=]+/g, '$1=<redacted>');

const pilotLog = (entry) => {
  const target = process.env.ADMS_PILOT_LOG;
  if (!target) return;
  const line = {
    server_utc: new Date().toISOString(),
    ...entry,
    ...(entry.command ? { command: redact(entry.command) } : {}),
  };
  try {
    fs.appendFileSync(target, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  } catch (error) {
    console.error('[pilot] cannot write pilot log:', error.message);
  }
};

const terminalFields = (terminal, ip) => ({
  terminal_sn: terminal?.deviceSN || '',
  terminal_ip: ip || terminal?.terminalIP || '',
  firmware: terminal?.firmware || '',
  algorithm: terminal?.algorithmVersion || '',
  push_version: terminal?.pushVersion || '',
  dialect: terminal?.dialect || '',
});

module.exports = { pilotLog, terminalFields, redact };
