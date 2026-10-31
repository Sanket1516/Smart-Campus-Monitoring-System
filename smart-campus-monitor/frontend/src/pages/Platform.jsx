import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/sentinel.css';
import { getPublicLiveDashboardApi } from '../services/api';
import CampusStage from '../components/brand/CampusStage';
import ArchitectureFlow from '../components/brand/ArchitectureFlow';
import { roleStatusFromTerminals } from '../components/brand/terminalStatus';
import { useIsCompact, useRevealChildren } from '../hooks/useMotion';
import { Chapter } from '../components/platform/primitives';
import { EnrollmentDemo, EntryDemo, ExitDemo, SyncDemo } from '../components/platform/StoryChapters';
import {
  AccessDemo,
  AnalyticsDemo,
  ApprovalDemo,
  CommandCenterDemo,
  HostellerDemo,
  NotificationsDemo,
  StudentsDemo,
  TerminalsDemo,
} from '../components/platform/OperationsChapters';

const NAV = [
  ['architecture', 'Architecture'],
  ['enrolment', 'Enrolment'],
  ['entry', 'Gates'],
  ['command', 'Command'],
  ['hostellers', 'Safety'],
  ['devices', 'Devices'],
  ['intelligence', 'Intelligence'],
];

const STORY = [
  { id: 'enrolment', focus: 'admin', caption: 'Admin control centre · Device 1' },
  { id: 'architecture', focus: 'sync', caption: 'Backend core → both gate terminals' },
  { id: 'entry', focus: 'entry', caption: 'Main gate · Terminal 01 · ENTRY' },
  { id: 'exit', focus: 'exit', caption: 'Main gate · Terminal 02 · EXIT' },
];

/** Public, anonymous numbers only (counts; never names or IDs). */
function useLiveSnapshot() {
  const [state, setState] = useState({ loading: true, data: null });
  useEffect(() => {
    let alive = true;
    const load = () =>
      getPublicLiveDashboardApi()
        .then((r) => alive && setState({ loading: false, data: r.data }))
        .catch(() => alive && setState({ loading: false, data: null }));
    load();
    const timer = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return state;
}

function HudCard({ label, value, tone = 'text-white', className = '' }) {
  return (
    <div className={`panel min-w-0 px-3 py-3 sm:px-4 ${className}`}>
      <div className="break-words font-mono text-[10px] uppercase tracking-[0.1em] text-ink-300 sm:tracking-[0.18em]">{label}</div>
      <div className={`metric mt-1 text-2xl ${tone}`}>{value}</div>
    </div>
  );
}

export default function Platform() {
  const root = useRevealChildren();
  const compact = useIsCompact();
  const live = useLiveSnapshot();
  const status = useMemo(() => roleStatusFromTerminals(live.data?.terminals), [live.data]);
  const [focus, setFocus] = useState('overview');
  const [caption, setCaption] = useState('');
  const sections = useRef({});
  const signedIn = typeof window !== 'undefined' && Boolean(window.localStorage.getItem('token'));

  // Camera follows the chapter in view.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const story = STORY.find((s) => s.id === entry.target.id);
          setFocus(story ? story.focus : 'overview');
          setCaption(story ? story.caption : '');
        });
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    Object.values(sections.current).forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const onlineGates = live.data?.terminals?.filter((t) => t.isOnline).length;
  const totalGates = live.data?.terminals?.length;
  const hud = live.data
    ? [
        ['Inside campus now', (live.data.currentlyInside ?? 0).toLocaleString('en-IN')],
        ['Gate terminals online', `${onlineGates ?? 0} / ${totalGates ?? 0}`, onlineGates === totalGates && totalGates ? 'text-emerald-300' : 'text-amber-300'],
        ['Unauthorised today', String(live.data.unauthorizedCount ?? 0), live.data.unauthorizedCount ? 'text-red-300' : 'text-white'],
      ]
    : null;

  const register = (id) => (node) => {
    sections.current[id] = node;
  };

  return (
    <div ref={root} className="dark min-h-screen bg-ink-900 text-ink-100">
      {/* ── Navigation ── */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-ink-900/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-3 md:px-10" aria-label="Platform">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10">
              <span className="h-2 w-2 rounded-full bg-cyan-300" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-white">Sentinel</span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400 sm:inline">Smart campus security</span>
          </Link>
          <div className="ml-auto hidden items-center gap-5 lg:flex">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="text-sm text-ink-200 transition hover:text-white">
                {label}
              </a>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Link to="/live" className="hidden text-sm text-ink-200 hover:text-white sm:inline">
              Live screen
            </Link>
            <Link to={signedIn ? '/dashboard' : '/login'} className="btn-accent px-4 py-2">
              {signedIn ? 'Open console' : 'Sign in'}
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero + story share one pinned 3D stage ── */}
      <div className="relative">
        {!compact && (
          <div className="pointer-events-none sticky top-0 -mb-[100vh] h-screen">
            <CampusStage focus={focus} status={status} className="h-full w-full" />
            <div className="absolute inset-0 bg-gradient-to-b from-ink-900/30 via-transparent to-ink-900/70" />
            <div className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-ink-900/90 via-ink-900/40 to-transparent" />
            {caption && (
              <div className="absolute bottom-8 right-8 font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-200/80 animate-fade-in" key={caption}>
                ◉ {caption}
              </div>
            )}
          </div>
        )}

        <section id="top" ref={register('top')} className="relative flex min-h-screen items-end px-5 pb-16 pt-28 md:px-10 md:pb-24">
          {compact && (
            <div className="absolute inset-0 -z-10 opacity-70">
              <div className="aurora absolute inset-0" />
            </div>
          )}
          <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div className="animate-rise">
              <p className="eyebrow mb-5">Biometric campus security platform</p>
              <h1 className="display-xl text-white">
                One Campus.
                <br />
                Two Gates.
                <br />
                <span className="bg-gradient-to-r from-cyan-300 via-primary-300 to-emerald-300 bg-clip-text text-transparent">Complete Control.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-200 md:text-lg">
                An intelligent biometric campus monitoring ecosystem connecting student enrolment, secure gate access,
                real-time monitoring and campus-wide security operations.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#enrolment" className="btn-accent">
                  Explore platform
                </a>
                <a href="#architecture" className="btn-ghost">
                  View system architecture
                </a>
              </div>
            </div>
            <div className="space-y-3 animate-fade-in" style={{ animationDelay: '1.2s' }}>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
                <span className={`h-1.5 w-1.5 rounded-full ${hud ? 'animate-pulse bg-emerald-400' : 'bg-ink-400'}`} />
                {live.loading ? 'Connecting…' : hud ? 'Live from this campus' : 'Live data unavailable'}
              </div>
              {hud ? (
                <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
                  {hud.map(([label, value, tone]) => (
                    <HudCard key={label} label={label} value={value} tone={tone} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-400">Counts appear here when the backend is reachable. Nothing on this page is invented as live.</p>
              )}
            </div>
          </div>
        </section>
        {compact && (
          <div className="px-5">
            <ArchitectureFlow status={status} />
          </div>
        )}

        {/* Story chapters over the pinned scene */}
        <div ref={register('enrolment')} id="enrolment">
          <div className="hidden h-[72vh] md:block" />
          <Chapter
            index={1}
            eyebrow="Central administrator workstation"
            title="Every Student. One Centralized Identity."
            intro="Students are registered once, in the web application or by Excel. The fingerprint is captured on a single administrator terminal, and the backend holds the identity every gate relies on."
            className="bg-ink-900/85 backdrop-blur-sm"
          >
            <div className="reveal">
              <EnrollmentDemo />
            </div>
          </Chapter>
        </div>

        <div ref={register('architecture')} id="architecture">
          <div className="hidden h-[72vh] md:block" />
          <Chapter
            index={2}
            eyebrow="Biometric synchronisation architecture"
            title="One Enrollment. Two Dedicated Gate Terminals."
            intro="The backend queues the user record and the stored template for each gate. Each terminal acknowledges, and the copy is then read back and compared. A gate that was offline catches up when it reconnects."
            className="bg-ink-900/85 backdrop-blur-sm"
          >
            <div className="reveal">
              <SyncDemo />
            </div>
          </Chapter>
        </div>

        <div ref={register('entry')} id="entry">
          <div className="hidden h-[72vh] md:block" />
          <Chapter
            index={3}
            eyebrow="Smart biometric entry"
            title="A Fingerprint. An Instant Access Decision."
            intro="Terminal 01 is registered as GATE_ENTRY, so every authorised punch it sends is an entry. The decision runs through the same policy pipeline as every other scan."
            className="bg-ink-900/85 backdrop-blur-sm"
          >
            <div className="reveal">
              <EntryDemo />
            </div>
          </Chapter>
        </div>

        <div ref={register('exit')} id="exit">
          <div className="hidden h-[72vh] md:block" />
          <Chapter
            index={4}
            eyebrow="Dedicated exit monitoring"
            title="Every Exit. Accounted For."
            intro="Terminal 02 is registered as GATE_EXIT. Its role, not the time of day or a toggle, decides that a punch is an exit. Hosteller approvals and curfew rules are checked as it happens."
            className="bg-ink-900/85 backdrop-blur-sm"
          >
            <div className="reveal">
              <ExitDemo />
            </div>
          </Chapter>
        </div>
      </div>

      {/* ── Operations chapters ── */}
      <div className="relative z-10 bg-ink-900">
        <Chapter id="command" index={5} eyebrow="Real-time campus command centre" title="Know What's Happening Across Your Campus." intro="Occupancy, entries, exits, hostellers, unauthorised attempts and terminal health on one screen, streamed over Socket.IO as events happen.">
          <div className="reveal">
            <CommandCenterDemo />
          </div>
        </Chapter>

        <Chapter id="hostellers" index={6} eyebrow="Hosteller safety & curfew intelligence" title="Student Safety Beyond the Campus Gate." className="bg-gradient-to-b from-ink-900 to-ink-850">
          <div className="reveal">
            <HostellerDemo />
          </div>
        </Chapter>

        <Chapter id="approvals" index={7} eyebrow="Digital exit approval" title="Secure Movement. Authorized Decisions." intro="Hostellers request an exit online. The warden decides, and an approved request opens a time window that the gate pipeline enforces.">
          <div className="reveal">
            <ApprovalDemo />
          </div>
        </Chapter>

        <Chapter id="students" index={8} eyebrow="Advanced student management" title="Thousands of Records. One Organized System." className="bg-gradient-to-b from-ink-850 to-ink-900">
          <div className="reveal">
            <StudentsDemo />
          </div>
        </Chapter>

        <Chapter id="security" index={9} eyebrow="Intelligent security & access control" title="Every Access Decision. Recorded and Accountable." intro="Blocking takes effect in software immediately, and the gate copies are removed. Every attempt by a blocked or unknown person becomes an auditable security event.">
          <div className="reveal">
            <AccessDemo />
          </div>
        </Chapter>

        <Chapter id="devices" index={10} eyebrow="Biometric terminal management" title="Every Device. Connected. Configured. Monitored." className="bg-gradient-to-b from-ink-900 to-ink-850">
          <div className="reveal">
            <TerminalsDemo />
          </div>
        </Chapter>

        <Chapter id="notifications" index={11} eyebrow="Parent notifications" title="Every Important Movement. Communicated.">
          <div className="reveal">
            <NotificationsDemo />
          </div>
        </Chapter>

        <Chapter id="intelligence" index={12} eyebrow="Analytics & campus intelligence" title="Turn Campus Movement Into Actionable Intelligence." className="bg-gradient-to-b from-ink-850 to-ink-900">
          <div className="reveal">
            <AnalyticsDemo />
          </div>
        </Chapter>

        {/* ── Honesty panel + CTA ── */}
        <section className="px-5 pb-24 md:px-10">
          <div className="reveal mx-auto grid max-w-7xl gap-6 rounded-3xl border border-white/10 bg-gradient-to-br from-ink-800 to-ink-900 p-8 md:grid-cols-[1.4fr_1fr] md:p-12">
            <div>
              <p className="eyebrow mb-3">Actual vs illustrative</p>
              <h2 className="display-md text-white">What you see here, and what runs in the console.</h2>
              <ul className="mt-5 space-y-2 text-sm leading-relaxed text-ink-200">
                <li>
                  <span className="text-white">Live:</span> the counts in the hero and the gate lights in the 3D scene come from this campus's public live
                  endpoint (counts only, never names or IDs).
                </li>
                <li>
                  <span className="text-white">Illustrative:</span> every chapter panel marked "sample data" uses invented names and numbers to explain a
                  workflow. The console shows the real records.
                </li>
                <li>
                  <span className="text-white">Hardware:</span> template sync to eSSL X990 gates is implemented over ADMS push with acknowledgement and
                  read-back. Device behaviour is confirmed per firmware during the hardware pilot.
                </li>
              </ul>
            </div>
            <div className="flex flex-col justify-end gap-3">
              <Link to={signedIn ? '/dashboard' : '/login'} className="btn-accent">
                {signedIn ? 'Open the console' : 'Sign in to the console'}
              </Link>
              <Link to="/live" className="btn-ghost">
                Open the public live screen
              </Link>
            </div>
          </div>
        </section>
        <footer className="border-t border-white/5 px-5 py-8 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-ink-400">
          Sentinel · Smart Campus Entry Monitoring &amp; Biometric Access Control
        </footer>
      </div>
    </div>
  );
}
