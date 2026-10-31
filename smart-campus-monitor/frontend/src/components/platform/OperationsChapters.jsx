import { useMemo, useState } from 'react';
import TerminalDevice from '../brand/TerminalDevice';
import { useInView, useSequence } from '../../hooks/useMotion';
import { SampleTag, Stat, Steps } from './primitives';

/* Illustrative series (clearly labelled as sample data in the UI). */
const HOURS = ['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'];
const ENTRIES = [12, 64, 410, 520, 180, 70, 60, 90, 75, 55, 40, 35, 60, 120, 95, 30];
const EXITS = [2, 6, 20, 30, 45, 60, 150, 120, 80, 140, 380, 420, 260, 140, 90, 40];

function BarPair({ entries = ENTRIES, exits = EXITS, height = 180, animate }) {
  const max = Math.max(...entries, ...exits);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {entries.map((value, i) => (
        <div key={HOURS[i]} className="flex flex-1 flex-col items-center justify-end gap-1">
          <div className="flex w-full items-end justify-center gap-[3px]" style={{ height: height - 18 }}>
            <div
              className="w-1/2 rounded-t bg-gradient-to-t from-emerald-600/40 to-emerald-400"
              style={{ height: animate ? `${(value / max) * 100}%` : '2%', transition: `height 0.9s cubic-bezier(.2,.7,.2,1) ${i * 30}ms` }}
            />
            <div
              className="w-1/2 rounded-t bg-gradient-to-t from-primary-700/40 to-primary-400"
              style={{ height: animate ? `${(exits[i] / max) * 100}%` : '2%', transition: `height 0.9s cubic-bezier(.2,.7,.2,1) ${i * 30 + 60}ms` }}
            />
          </div>
          <span className="font-mono text-[9px] text-ink-400">{HOURS[i]}</span>
        </div>
      ))}
    </div>
  );
}

function AreaChart({ animate, height = 220 }) {
  // occupancy through the day = cumulative entries − exits
  const series = useMemo(() => {
    let current = 120;
    return ENTRIES.map((e, i) => {
      current += e - EXITS[i];
      return Math.max(0, current);
    });
  }, []);
  const max = Math.max(...series) * 1.1;
  const points = series.map((v, i) => [(i / (series.length - 1)) * 1000, height - (v / max) * height]);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L1000 ${height} L0 ${height} Z`;
  return (
    <svg viewBox={`0 0 1000 ${height}`} className="h-auto w-full" preserveAspectRatio="none" role="img" aria-label="Sample campus occupancy through the day">
      <defs>
        <linearGradient id="occ" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2="1000" y1={height * f} y2={height * f} stroke="rgba(148,170,210,0.08)" />
      ))}
      <path d={area} fill="url(#occ)" style={{ opacity: animate ? 1 : 0, transition: 'opacity 1.2s ease' }} />
      <path
        d={line}
        fill="none"
        stroke="#22d3ee"
        strokeWidth="2.5"
        strokeDasharray="2400"
        strokeDashoffset={animate ? 0 : 2400}
        style={{ transition: 'stroke-dashoffset 2s cubic-bezier(.2,.7,.2,1)' }}
      />
    </svg>
  );
}

/* ── Chapter 5: command centre ───────────────────────────────────────────── */
const EVENTS = [
  ['ok', 'Student entered campus', 'Main Gate · T-01', '09:41:07'],
  ['ok', 'Student exited campus', 'Main Gate · T-02', '09:40:52'],
  ['bad', 'Unauthorised fingerprint attempt', 'Main Gate · T-01', '09:39:30'],
  ['info', 'Hosteller exit approved by warden', 'Boys Hostel A', '09:38:11'],
  ['off', 'Terminal disconnected', 'Main Gate · T-02', '09:31:45'],
  ['ok', 'Terminal connected', 'Main Gate · T-02', '09:32:02'],
  ['warn', 'Late return flagged (curfew 21:30)', 'Main Gate · T-01', '21:47:19'],
];

export function CommandCenterDemo() {
  const [ref, inView] = useInView({ threshold: 0.25, once: true });
  const tick = useSequence(EVENTS.length, { active: inView, interval: 1600 });
  const stream = [...EVENTS.slice(tick), ...EVENTS.slice(0, tick)].slice(0, 6);
  return (
    <div ref={ref} className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-5 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-300">Security operations · Today</span>
        <SampleTag />
      </div>
      <div className="grid gap-px bg-white/5 md:grid-cols-5">
        {[
          ['Inside campus', '1,286', 'text-white'],
          ['Entries today', '1,912', 'text-emerald-300'],
          ['Exits today', '1,148', 'text-[#8fb0ff]'],
          ['Unauthorised', '7', 'text-red-300'],
          ['Late returns', '3', 'text-amber-300'],
        ].map(([label, value, tone]) => (
          <div key={label} className="bg-ink-850 p-5">
            <Stat label={label} value={value} tone={tone} />
          </div>
        ))}
      </div>
      <div className="grid gap-px bg-white/5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6 bg-ink-850 p-5">
          <div>
            <div className="mb-3 flex items-center justify-between text-xs text-ink-300">
              <span>Hourly entry / exit</span>
              <span className="flex gap-3">
                <span className="flex items-center gap-1">
                  <i className="h-2 w-2 rounded-sm bg-emerald-400" /> Entry
                </span>
                <span className="flex items-center gap-1">
                  <i className="h-2 w-2 rounded-sm bg-primary-400" /> Exit
                </span>
              </span>
            </div>
            <BarPair animate={inView} height={160} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Day scholars inside" value="884" />
            <Stat label="Hostellers inside" value="402" />
            <Stat label="Hostellers outside" value="58" tone="text-amber-300" />
            <Stat label="Active terminals" value="2 / 2" tone="text-emerald-300" />
          </div>
        </div>
        <div className="bg-ink-850 p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-ink-300">Live event stream</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> SOCKET
            </span>
          </div>
          <ul className="space-y-2">
            {stream.map(([tone, text, where, time], i) => (
              <li key={`${text}-${i}`} className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone === 'ok' ? 'bg-emerald-400' : tone === 'bad' ? 'bg-red-400' : tone === 'warn' ? 'bg-amber-400' : tone === 'off' ? 'bg-ink-400' : 'bg-primary-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{text}</div>
                  <div className="font-mono text-[10px] text-ink-400">
                    {where} · {time}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ── Chapter 6: hosteller safety ─────────────────────────────────────────── */
const HOSTELLERS = [
  ['Ishita Rao', '70021400342', 'Girls Hostel B', 'inside', '18:02', false, 'Approved'],
  ['Kabir Shah', '70021400917', 'Boys Hostel A', 'outside', '19:41', false, 'Active until 21:00'],
  ['Neha Iyer', '70021400155', 'Girls Hostel B', 'outside', '21:47', true, 'Expired'],
  ['Rohan Das', '70021400628', 'Boys Hostel A', 'none', '—', false, '—'],
];

export function HostellerDemo() {
  const [filter, setFilter] = useState('all');
  const rows = HOSTELLERS.filter((r) => filter === 'all' || r[3] === filter || (filter === 'late' && r[5]));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {[
            ['Total hostellers', '460'],
            ['Inside', '402'],
            ['Outside', '58'],
            ['No activity today', '11'],
            ['Late returns', '3'],
            ['Active approvals', '24'],
          ].map(([label, value]) => (
            <div key={label} className="panel-flat p-4">
              <Stat label={label} value={value} tone={label === 'Late returns' ? 'text-amber-300' : 'text-white'} />
            </div>
          ))}
        </div>
        <Steps
          active={4}
          tone="#f59e0b"
          steps={[
            'Hosteller exits through Terminal 02',
            'Exit timestamp recorded',
            'Configured curfew rule evaluated',
            'Late-return flag raised where applicable',
            'Warden and administrators review',
          ]}
        />
      </div>
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {['all', 'inside', 'outside', 'late', 'none'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-3 py-1 text-xs capitalize transition ${filter === key ? 'bg-white text-ink-900' : 'text-ink-200 hover:bg-white/5'}`}
              >
                {key === 'none' ? 'No activity' : key}
              </button>
            ))}
          </div>
          <SampleTag />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">
                {['Student', 'SAP ID', 'Hostel', 'Status', 'Last scan', 'Late', 'Exit approval'].map((h) => (
                  <th key={h} className="px-4 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, sap, hostel, status, last, late, approval]) => (
                <tr key={sap} className="border-t border-white/5">
                  <td className="px-4 py-2.5 text-white">{name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-200">{sap}</td>
                  <td className="px-4 py-2.5 text-ink-200">{hostel}</td>
                  <td className="px-4 py-2.5">
                    <span className={status === 'inside' ? 'chip-ok' : status === 'outside' ? 'chip-warn' : 'chip-off'}>
                      {status === 'none' ? 'No activity' : status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-200">{last}</td>
                  <td className="px-4 py-2.5">{late ? <span className="chip-bad">Late</span> : <span className="text-ink-400">—</span>}</td>
                  <td className="px-4 py-2.5 text-ink-200">{approval}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Chapter 7: digital exit approval ────────────────────────────────────── */
export function ApprovalDemo() {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const step = useSequence(6, { active: inView, interval: 1600 });
  const status = step < 1 ? 'Draft' : step < 3 ? 'Pending' : step < 4 ? 'Approved' : 'Active';
  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-3">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Student · Exit request</span>
          <SampleTag />
        </div>
        <div className="space-y-3 text-sm">
          {[
            ['SAP ID', '70021400917 (verified)'],
            ['Reason', 'Family function in town'],
            ['Departure', 'Today, 17:30'],
            ['Expected return', 'Today, 21:00'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">{label}</div>
              <div className="text-white">{value}</div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <span className="text-ink-300">Request status</span>
            <span className={status === 'Pending' ? 'chip-warn' : status === 'Draft' ? 'chip-off' : 'chip-ok'}>{status}</span>
          </div>
        </div>
      </div>
      <div className="panel p-5">
        <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Warden portal · Pending</div>
        <div className={`rounded-xl border p-4 transition-all duration-500 ${step >= 1 ? 'border-amber-400/40 bg-amber-500/5 opacity-100' : 'border-white/5 opacity-40'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-white">Kabir Shah</div>
              <div className="font-mono text-[11px] text-ink-300">Boys Hostel A · Room 214</div>
            </div>
            <span className="chip-info">3h 30m</span>
          </div>
          <p className="mt-3 text-sm text-ink-200">Family function in town</p>
          <div className="mt-4 flex gap-2">
            <span className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition ${step >= 3 ? 'bg-emerald-500 text-ink-900' : 'bg-emerald-500/15 text-emerald-300'}`}>Approve</span>
            <span className="flex-1 rounded-lg bg-red-500/10 py-2 text-center text-sm font-semibold text-red-300">Reject…</span>
          </div>
        </div>
      </div>
      <Steps
        active={step}
        tone="#10b981"
        steps={[
          'Student submits the exit request',
          'Request appears in the warden portal',
          'Warden reviews the request',
          'Approval (or rejection with reason) recorded',
          'Approval active for its time window',
          'Gate policy lets the hosteller exit and re-enter',
        ]}
      />
    </div>
  );
}

/* ── Chapter 8: student management + Excel ───────────────────────────────── */
export function StudentsDemo() {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const step = useSequence(7, { active: inView, interval: 1200 });
  const processed = Math.min(1, step / 6);
  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-3">
          <div className="flex-1 rounded-lg border border-white/10 bg-ink-900/60 px-3 py-1.5 font-mono text-xs text-ink-300">Search SAP ID or name…</div>
          {['Department', 'Year', 'Category', 'Enrolment', 'Access'].map((f) => (
            <span key={f} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-ink-200">
              {f} ▾
            </span>
          ))}
        </div>
        <table className="min-w-full text-sm">
          <tbody>
            {[
              ['Aarav Mehta', '70021400118', 'Comp. Engg · Y2', 'Hosteller', 'Fully synchronised', 'chip-ok', 'Active'],
              ['Diya Kapoor', '70021400204', 'Pharmacy · Y1', 'Day scholar', 'Awaiting fingerprint', 'chip-warn', 'Active'],
              ['Vivaan Nair', '70021400377', 'MBA Tech · Y3', 'Day scholar', 'Partially synchronised', 'chip-warn', 'Active'],
              ['Sara Khan', '70021400411', 'Comp. Engg · Y4', 'Hosteller', 'Removed from gates', 'chip-off', 'Blocked'],
            ].map(([name, sap, dept, cat, enrol, cls, access]) => (
              <tr key={sap} className="border-t border-white/5 first:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{name}</div>
                  <div className="font-mono text-[11px] text-ink-400">{sap}</div>
                </td>
                <td className="hidden px-4 py-3 text-ink-200 md:table-cell">{dept}</td>
                <td className="px-4 py-3 text-ink-200">{cat}</td>
                <td className="px-4 py-3">
                  <span className={cls}>{enrol}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={access === 'Active' ? 'chip-ok' : 'chip-bad'}>{access}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Excel bulk enrolment</span>
          <SampleTag />
        </div>
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-dashed border-white/15 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 font-mono text-xs text-emerald-300">XLSX</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white">students_2026_batch.xlsx</div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-700" style={{ width: `${processed * 100}%` }} />
            </div>
          </div>
        </div>
        <Steps
          active={step}
          steps={['File selected', 'File validated', 'Rows extracted', 'Duplicates detected', 'Categories mapped', 'Students inserted', 'Failures reported']}
        />
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            ['Total', step >= 2 ? 240 : 0],
            ['Inserted', step >= 5 ? 231 : 0],
            ['Failed', step >= 6 ? 6 : 0],
            ['Duplicates', step >= 3 ? 3 : 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/[0.03] p-2">
              <div className="metric text-xl text-white">{value}</div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-ink-400">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Chapter 9: access control ───────────────────────────────────────────── */
export function AccessDemo() {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const step = useSequence(6, { active: inView, interval: 1500 });
  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
      <div className="panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Block record</span>
          <SampleTag />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Student', 'Sara Khan'],
            ['SAP ID', '70021400411'],
            ['Reason', 'Disciplinary hold'],
            ['Administrator', 'admin.registrar'],
            ['Timestamp', '31 Oct 2026, 10:12'],
            ['Access status', 'BLOCKED'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">{label}</dt>
              <dd className={`mt-0.5 font-medium ${value === 'BLOCKED' ? 'text-red-300' : 'text-white'}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <TerminalDevice mode="ENTRY" state={step >= 3 ? 'denied' : step >= 1 ? 'scanning' : 'idle'} title="T-01" lines={step >= 3 ? ['ACCESS DENIED', 'BLOCKED'] : ['PLACE FINGER']} />
      <Steps
        active={step}
        tone="#f04444"
        steps={[
          'Fingerprint identified on Terminal 01',
          'Backend validates access',
          'Blocked status detected',
          'Access denied in software at once',
          'Security event recorded',
          'Real-time alert to staff',
        ]}
      />
    </div>
  );
}

/* ── Chapter 10: terminal management ─────────────────────────────────────── */
export function TerminalsDemo() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {[
        ['ENTRY', 'Terminal 01 · Entry', 'CQZ7231460011', 101],
        ['EXIT', 'Terminal 02 · Exit', 'CQZ7231460012', 102],
      ].map(([mode, title, sn, machine]) => (
        <div key={mode} className="panel grid items-center gap-6 p-6 sm:grid-cols-[auto_1fr]">
          <TerminalDevice mode={mode} title={mode === 'ENTRY' ? 'T-01' : 'T-02'} lines={['ONLINE', 'QUEUE EMPTY']} />
          <div>
            <div className="mb-1 flex items-center justify-between">
              <div className="font-display text-xl font-semibold text-white">{title}</div>
              <SampleTag>Sample</SampleTag>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Serial number', sn],
                ['Machine number', machine],
                ['Terminal mode', `${mode} only (by role)`],
                ['Status', 'Online'],
                ['Last heartbeat', '4 s ago'],
                ['Last successful scan', '09:41:07'],
                ['Activity today', mode === 'ENTRY' ? '1,912 punches' : '1,148 punches'],
                ['Enrolment sync', '1,286 verified · 0 pending'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-white/5 pb-1.5">
                  <dt className="text-ink-400">{label}</dt>
                  <dd className="text-right font-mono text-xs text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Chapter 11: parent notifications ────────────────────────────────────── */
export function NotificationsDemo() {
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
      <div className="panel p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Biometric event</div>
        <div className="mt-2 font-display text-2xl text-white">EXIT · Terminal 02</div>
        <div className="mt-1 text-sm text-ink-200">Received by the backend at 17:31:04</div>
        <div className="mt-4 flex gap-2">
          <span className="chip-info">Nodemailer · SMTP</span>
          <span className="chip-info">Fast2SMS</span>
        </div>
      </div>
      <svg viewBox="0 0 120 140" className="mx-auto hidden h-36 w-28 lg:block" aria-hidden="true">
        <path d="M0 70 C 60 70, 60 20, 120 20" fill="none" stroke="#22d3ee" strokeWidth="2" strokeDasharray="4 12" className="animate-dash-flow" />
        <path d="M0 70 C 60 70, 60 120, 120 120" fill="none" stroke="#5b8cff" strokeWidth="2" strokeDasharray="4 12" className="animate-dash-flow" />
      </svg>
      <div className="space-y-4">
        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">Email</span>
            <SampleTag>Sample</SampleTag>
          </div>
          <div className="mt-2 text-sm font-semibold text-white">Campus exit: Aarav Mehta</div>
          <p className="mt-1 text-sm text-ink-200">Aarav left the campus through the Main Gate exit terminal at 17:31 on 31 Oct 2026.</p>
          <div className="mt-2 font-mono text-[10px] text-ink-400">to: parent@example.com</div>
        </div>
        <div className="panel ml-auto max-w-xs rounded-[22px] p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">SMS</div>
          <p className="mt-1 rounded-2xl rounded-tl-sm bg-primary-600/25 px-3 py-2 text-sm text-white">
            CAMPUS: Aarav Mehta exited Main Gate at 17:31, 31-Oct.
          </p>
          <div className="mt-2 font-mono text-[10px] text-ink-400">to: +91 9XXXX XXXXX</div>
        </div>
      </div>
    </div>
  );
}

/* ── Chapter 12: analytics ───────────────────────────────────────────────── */
export function AnalyticsDemo() {
  const [ref, inView] = useInView({ threshold: 0.25, once: true });
  return (
    <div ref={ref} className="panel p-5 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Campus occupancy · through the day</div>
          <div className="metric mt-2 text-5xl text-white">1,286</div>
          <div className="text-sm text-ink-300">peak at 10:00 · quietest at 06:00</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Today', '7 days', '30 days', 'Custom'].map((r, i) => (
            <span key={r} className={`rounded-full border px-3 py-1 text-xs ${i === 0 ? 'border-white/30 bg-white/10 text-white' : 'border-white/10 text-ink-300'}`}>
              {r}
            </span>
          ))}
          <SampleTag />
        </div>
      </div>
      <AreaChart animate={inView} />
      <div className="mt-8 grid gap-8 md:grid-cols-[2fr_1fr]">
        <BarPair animate={inView} height={140} />
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Peak entry hour" value="09:00" />
          <Stat label="Unauthorised · 7d" value="23" tone="text-red-300" />
          <Stat label="Day scholars" value="68%" />
          <Stat label="Hostellers" value="32%" />
        </div>
      </div>
    </div>
  );
}
