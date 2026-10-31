import { useState } from 'react';
import FingerprintGlyph from '../brand/FingerprintGlyph';
import TerminalDevice from '../brand/TerminalDevice';
import ArchitectureFlow from '../brand/ArchitectureFlow';
import { useInView, useSequence } from '../../hooks/useMotion';
import { SampleTag, Steps } from './primitives';

const SAMPLE = {
  name: 'Aarav Mehta',
  sapId: '70021400118',
  department: 'Computer Engineering',
  year: '2nd year',
  category: 'Hosteller',
  pin: '1042',
};

/* ── Chapter 1: centralized enrolment ─────────────────────────────────────── */
const ENROL_STEPS = [
  'Student record created (form or Excel)',
  'SAP ID registered · ZKTeco user ID 1042 assigned',
  'Details, category and consent recorded',
  'Enrolment started on Device 1 (admin terminal)',
  'Finger captured on Device 1; template uploaded',
  'Template validated (SHA-256) and stored encrypted',
  'Enrolment active · gate sync queued',
];

const ENROL_STATES = [
  ['Registered', 'chip-info'],
  ['Fingerprint not enrolled', 'chip-off'],
  ['Fingerprint enrolled', 'chip-ok'],
  ['Pending synchronisation', 'chip-warn'],
  ['Synchronised (verified)', 'chip-ok'],
];

export function EnrollmentDemo() {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const step = useSequence(ENROL_STEPS.length, { active: inView, interval: 1500 });
  const fp = step < 3 ? 'off' : step === 3 ? 'idle' : step === 4 ? 'scanning' : 'ok';
  const statusChip = step < 4 ? ENROL_STATES[1] : step < 6 ? ENROL_STATES[2] : ENROL_STATES[3];
  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-300">Admin workstation · Enrolment</span>
          <SampleTag />
        </div>
        <div className="grid gap-6 p-5 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-28 w-24 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-b from-ink-700 to-ink-800 font-display text-3xl text-ink-200">
              AM
            </div>
            <FingerprintGlyph state={fp} size={84} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              ['Student', SAMPLE.name, step >= 0],
              ['SAP ID', SAMPLE.sapId, step >= 1],
              ['ZKTeco user ID', SAMPLE.pin, step >= 1],
              ['Department', SAMPLE.department, step >= 2],
              ['Academic year', SAMPLE.year, step >= 2],
              ['Category', SAMPLE.category, step >= 2],
            ].map(([label, value, shown]) => (
              <div key={label}>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">{label}</dt>
                <dd className={`mt-0.5 font-medium transition-all duration-500 ${shown ? 'text-white' : 'text-transparent'}`}>
                  {shown ? value : '—'}
                </dd>
              </div>
            ))}
            <div className="col-span-2 flex flex-wrap items-center gap-2 pt-1">
              <span className={statusChip[1]}>{statusChip[0]}</span>
              {step === 6 && <span className="chip-ok">Enrolment active</span>}
            </div>
          </dl>
        </div>
      </div>
      <div>
        <Steps steps={ENROL_STEPS} active={step} />
        <div className="mt-5 flex flex-wrap gap-2">
          {ENROL_STATES.map(([label, cls]) => (
            <span key={label} className={cls}>
              {label}
            </span>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-400">
          In the live system a fingerprint is shown as enrolled only after the template captured on Device 1
          reaches the backend and is stored. Nothing is marked enrolled from the UI alone.
        </p>
      </div>
    </div>
  );
}

/* ── Chapter 2: synchronisation ───────────────────────────────────────────── */
const SYNC_STAGES = [
  { entry: 'pending', exit: 'pending', note: 'Queued: user record + template for each gate' },
  { entry: 'stored', exit: 'pending', note: 'Entry terminal acknowledged (Return=0)' },
  { entry: 'verified', exit: 'stored', note: 'Entry read back: SHA-256 matches. Exit acknowledged' },
  { entry: 'verified', exit: 'verified', note: 'Both gates verified → FULLY SYNCHRONIZED' },
];

const GATE_CHIP = {
  pending: ['Pending', 'chip-warn'],
  stored: ['Stored · not verified', 'chip-info'],
  verified: ['Synchronised · verified', 'chip-ok'],
  failed: ['Failed', 'chip-bad'],
  offline: ['Offline · will catch up', 'chip-off'],
};

export function SyncDemo() {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const stage = useSequence(SYNC_STAGES.length, { active: inView, interval: 1800 });
  const current = SYNC_STAGES[stage];
  const overall = stage === 3 ? ['FULLY SYNCHRONIZED', 'chip-ok'] : stage === 0 ? ['PENDING', 'chip-warn'] : ['PARTIALLY SYNCHRONIZED', 'chip-warn'];
  return (
    <div ref={ref} className="space-y-6">
      <div className="panel p-4 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-300">Synchronisation pipeline</span>
          <SampleTag />
        </div>
        <ArchitectureFlow />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Gate Entry · Terminal 01', 'ENTRY', current.entry],
          ['Gate Exit · Terminal 02', 'EXIT', current.exit],
        ].map(([label, mode, state]) => (
          <div key={mode} className="panel flex items-center gap-4 p-4">
            <TerminalDevice mode={mode} compact state={state === 'verified' ? 'ok' : 'idle'} title={mode === 'ENTRY' ? 'T-01' : 'T-02'} lines={['USER 1042', `TEMPLATE ${state === 'pending' ? '…' : 'OK'}`]} />
            <div>
              <div className="text-sm font-semibold text-white">{label}</div>
              <span className={`mt-2 ${GATE_CHIP[state][1]}`}>{GATE_CHIP[state][0]}</span>
              <div className="mt-2 font-mono text-[10px] text-ink-400">last sync · just now</div>
            </div>
          </div>
        ))}
        <div className="panel flex flex-col justify-between p-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">Overall</div>
            <span className={`mt-2 ${overall[1]}`}>{overall[0]}</span>
            <p className="mt-3 text-sm text-ink-200">{current.note}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {Object.values(GATE_CHIP).map(([label, cls]) => (
              <span key={label} className={cls}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-4 text-sm text-ink-200 md:grid-cols-2">
        <div className="panel-flat p-4">
          <div className="mb-1 font-semibold text-white">Central database</div>
          Holds the template captured on Device 1, encrypted (AES-256-GCM) and never exposed by any API.
          It is the source used to restore a gate. No fingerprint has to be captured twice.
        </div>
        <div className="panel-flat p-4">
          <div className="mb-1 font-semibold text-white">Device-level records</div>
          Each gate stores its own copy, written by queued ADMS push commands and confirmed by an
          acknowledgement and a read-back. Whether a given X990 firmware accepts a template written this
          way is checked during the hardware pilot. Until then the status reads "not verified".
        </div>
      </div>
    </div>
  );
}

/* ── Chapter 3 & 4: entry / exit decisions ────────────────────────────────── */
const ENTRY_STEPS = [
  'Student approaches the entry gate',
  'Finger placed on Terminal 01',
  'Terminal identifies user ID 1042',
  'Punch sent to the backend (ATTLOG)',
  'Policies: registered terminal · known student · not blocked',
  'ENTRY authorised by terminal role',
  'Entry timestamp recorded',
  'Occupancy +1 · dashboards update live',
];

const EXIT_STEPS = [
  'Student approaches the exit gate',
  'Finger placed on Terminal 02',
  'Identity matched (user ID 1042)',
  'Hosteller: active warden approval checked',
  'EXIT recorded by terminal role',
  'Timestamp saved · curfew rule evaluated',
  'Occupancy −1',
  'Parent notification + live alert',
];

const REJECTIONS = {
  unknown: { title: 'Unknown fingerprint', reason: 'unknown_user', detail: 'No enrolled student for this user ID. Logged as an unauthorised attempt with an alert.' },
  blocked: { title: 'Blocked student', reason: 'blocked', detail: 'Student is blocked. Access denied in software and a security alert is raised. The gate copy is queued for deletion.' },
  terminal: { title: 'Invalid terminal', reason: 'unknown terminal', detail: 'Serial number not registered. The request is refused and an unknown-terminal alert is raised.' },
  approval: { title: 'Missing approval', reason: 'warden_approval_required', detail: 'Hosteller has no active warden approval for this window. Denied and the warden is alerted.' },
};

function GateDemo({ mode }) {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const steps = mode === 'ENTRY' ? ENTRY_STEPS : EXIT_STEPS;
  const step = useSequence(steps.length, { active: inView, interval: 1300 });
  const [rejection, setRejection] = useState(null);
  const state = rejection ? 'denied' : step <= 1 ? 'idle' : step <= 3 ? 'scanning' : 'ok';
  const accent = mode === 'ENTRY' ? 'text-emerald-300' : 'text-[#8fb0ff]';
  const occupancy = mode === 'ENTRY' ? (step >= 7 ? 1287 : 1286) : step >= 6 ? 1285 : 1286;
  const reject = rejection ? REJECTIONS[rejection] : null;
  return (
    <div ref={ref} className="grid items-center gap-8 lg:grid-cols-[auto_1fr_1fr]">
      <TerminalDevice
        mode={mode}
        state={state}
        title={mode === 'ENTRY' ? 'T-01' : 'T-02'}
        lines={reject ? ['ACCESS DENIED', reject.reason.toUpperCase()] : step >= 5 ? [`${mode} AUTHORISED`, 'USER 1042', '09:41:07'] : ['PLACE FINGER', 'ON SENSOR']}
      />
      <Steps steps={steps} active={rejection ? -1 : step} tone={mode === 'ENTRY' ? '#10b981' : '#5b8cff'} />
      <div className="space-y-4">
        <div className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Decision</span>
            <SampleTag />
          </div>
          {reject ? (
            <div>
              <span className="chip-bad">ACCESS DENIED · {reject.title}</span>
              <p className="mt-3 text-sm text-ink-200">{reject.detail}</p>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Student', SAMPLE.name],
                ['SAP ID', SAMPLE.sapId],
                ['Category', SAMPLE.category],
                ['Terminal', mode === 'ENTRY' ? 'Main Gate · T-01 (ENTRY)' : 'Main Gate · T-02 (EXIT)'],
                [mode === 'ENTRY' ? 'Entry time' : 'Exit time', step >= 6 ? '09:41:07' : '—'],
                ['Status', step >= 5 ? `${mode} AUTHORISED` : 'Verifying…'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">{label}</dt>
                  <dd className={`mt-0.5 font-medium ${label === 'Status' && step >= 5 ? accent : 'text-white'}`}>{value}</dd>
                </div>
              ))}
              <div className="col-span-2 flex items-end justify-between border-t border-white/5 pt-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">Currently inside campus</span>
                <span className="metric text-2xl text-white">{occupancy.toLocaleString('en-IN')}</span>
              </div>
            </dl>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-ink-400">Rejected attempts:</span>
          {Object.entries(REJECTIONS).map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRejection(rejection === key ? null : key)}
              className={`rounded-full border px-3 py-1 text-xs transition ${rejection === key ? 'border-red-400/60 bg-red-500/15 text-red-200' : 'border-white/10 text-ink-200 hover:border-white/25'}`}
            >
              {value.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const EntryDemo = () => <GateDemo mode="ENTRY" />;
export const ExitDemo = () => <GateDemo mode="EXIT" />;
