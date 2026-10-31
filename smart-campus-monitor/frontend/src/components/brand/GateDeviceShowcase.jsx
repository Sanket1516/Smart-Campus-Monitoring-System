import { useEffect, useState } from 'react';
import TerminalDevice from './TerminalDevice';
import { getSyncTerminalsApi } from '../../services/api';

const ROLES = [
  ['ADMIN_ENROLLMENT', 'ENROLLMENT', 'Device 1 · Admin enrolment'],
  ['GATE_ENTRY', 'ENTRY', 'Terminal 01 · Entry'],
  ['GATE_EXIT', 'EXIT', 'Terminal 02 · Exit'],
];

const ago = (value) => {
  if (!value) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(value).toLocaleDateString('en-IN');
};

/**
 * The three role terminals as hardware objects with real spec sheets.
 * Data: terminal list (Terminal Management API) + sync health (Terminal Sync API).
 */
export default function GateDeviceShowcase({ terminals = [] }) {
  const [sync, setSync] = useState({});
  useEffect(() => {
    getSyncTerminalsApi()
      .then((res) => setSync(Object.fromEntries((res.data.terminals || []).map((t) => [t.serialNumber, t]))))
      .catch(() => setSync({}));
  }, [terminals.length]);

  return (
    <section className="grid gap-4 xl:grid-cols-3" aria-label="Role terminals">
      {ROLES.map(([role, mode, title]) => {
        const terminal = terminals.find((t) => t.deviceRole === role && t.enabled !== false);
        const health = terminal ? sync[terminal.deviceSN] : null;
        const last = terminal?.lastScanEvent;
        const rows = terminal
          ? [
              ['Serial number', terminal.deviceSN],
              ['Machine number', terminal.machineNumber],
              ['Terminal mode', role === 'ADMIN_ENROLLMENT' ? 'Enrolment only' : `${mode} only (by role)`],
              ['Status', terminal.isOnline ? 'Online' : 'Offline'],
              ['Last heartbeat', ago(terminal.lastSeen)],
              ['Last successful scan', last && last.type !== 'unauthorized' ? ago(last.timestamp) : '—'],
              ['Activity today', `${terminal.scansToday || 0} scans · ${terminal.totalScans || 0} total`],
              [
                'Enrolment sync',
                health
                  ? `${health.fingerprintsVerified} verified · ${health.pending} pending${health.failed ? ` · ${health.failed} failed` : ''}`
                  : 'n/a',
              ],
            ]
          : [];
        return (
          <article key={role} className="panel relative overflow-hidden p-6">
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full blur-3xl"
              style={{ background: mode === 'ENTRY' ? 'rgba(16,185,129,0.10)' : mode === 'EXIT' ? 'rgba(61,109,255,0.12)' : 'rgba(34,211,238,0.08)' }}
            />
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-white">{title}</h2>
              {terminal ? (
                <span className={terminal.isOnline ? 'chip-ok' : 'chip-off'}>{terminal.isOnline ? 'Online' : 'Offline'}</span>
              ) : (
                <span className="chip-warn">Not assigned</span>
              )}
            </div>
            <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr] xl:grid-cols-1">
              <TerminalDevice
                compact
                mode={mode}
                online={Boolean(terminal?.isOnline)}
                title={terminal ? `#${terminal.machineNumber}` : ''}
                lines={terminal ? [terminal.terminalLabel?.toUpperCase().slice(0, 18) || '', `${terminal.scansToday || 0} TODAY`] : []}
              />
              {terminal ? (
                <dl className="space-y-1.5 text-sm">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-1.5">
                      <dt className="shrink-0 text-ink-400">{label}</dt>
                      <dd className={`text-right font-mono text-xs ${label === 'Status' ? (terminal.isOnline ? 'text-emerald-300' : 'text-ink-300') : 'text-white'}`}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-ink-300">
                  No enabled terminal has the <span className="font-mono text-amber-300">{role}</span> role. Register one below or edit a
                  terminal and choose this role.
                </p>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
