import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { getPublicLiveDashboardApi } from '../services/api';
import CampusStage from '../components/brand/CampusStage';
import { roleStatusFromTerminals } from '../components/brand/terminalStatus';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const deriveSocketUrl = () => {
  const configured = import.meta.env.VITE_SOCKET_URL;
  if (configured) return configured;
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl || apiUrl.startsWith('/')) return undefined;
  return apiUrl.replace(/\/api\/?$/, '');
};

const EVENT_META = {
  entry: ['bg-emerald-400', 'Entry'],
  exit: ['bg-primary-400', 'Exit'],
  unauthorized: ['bg-red-400', 'Unauthorised attempt'],
  blocked: ['bg-red-400', 'Access denied'],
  terminal_online: ['bg-emerald-400', 'Terminal connected'],
  terminal_offline: ['bg-ink-400', 'Terminal disconnected'],
};

const time = (value) =>
  new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="text-right">
      <div className="font-mono text-2xl tabular-nums text-white">{time(now)}</div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
        {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
    </div>
  );
}

/**
 * Public, read-only campus screen (e.g. a monitor at the security desk or reception).
 * Shows counts, gate status and anonymised movement only — never names, SAP IDs or photos.
 * Data: GET /api/live (counts) + Socket.IO `public:activity` (anonymised events).
 */
export default function PublicLiveDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await getPublicLiveDashboardApi();
      setDashboard(res.data);
      setError('');
    } catch (_error) {
      setError('Live data is unavailable right now.');
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const socket = io(deriveSocketUrl(), { autoConnect: true, transports: ['websocket', 'polling'] });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    const onActivity = (event) => {
      setEvents((current) => [{ ...event, id: `${event.time}-${Math.random()}` }, ...current].slice(0, 30));
      setDashboard((current) => {
        if (!current) return current;
        const next = { ...current };
        if (event.eventType === 'entry') next.currentlyInside = (current.currentlyInside || 0) + 1;
        if (event.eventType === 'exit') next.currentlyInside = Math.max(0, (current.currentlyInside || 0) - 1);
        if (event.eventType === 'unauthorized') next.unauthorizedCount = (current.unauthorizedCount || 0) + 1;
        if (event.eventType === 'blocked') next.blockedCount = (current.blockedCount || 0) + 1;
        if (event.eventType === 'terminal_online' || event.eventType === 'terminal_offline') {
          next.terminals = (current.terminals || []).map((t) =>
            t.machineNumber === event.machineNumber ? { ...t, isOnline: event.eventType === 'terminal_online' } : t
          );
        }
        return next;
      });
    };
    socket.on('public:activity', onActivity);
    return () => {
      socket.off('public:activity', onActivity);
      socket.disconnect();
    };
  }, []);

  const status = useMemo(() => roleStatusFromTerminals(dashboard?.terminals), [dashboard]);
  const online = (dashboard?.terminals || []).filter((t) => t.isOnline).length;
  const total = (dashboard?.terminals || []).length;

  // Recorded activity from the API (already anonymous) after live socket events.
  const stream = useMemo(
    () => [
      ...events,
      ...(dashboard?.liveActivity || []).map((a) => ({ ...a, eventType: a.eventType, id: a.id })),
    ].slice(0, 14),
    [events, dashboard]
  );

  const hours = Array.from({ length: 18 }, (_, i) => i + 5);
  const chartData = {
    labels: hours.map((h) => `${String(h).padStart(2, '0')}`),
    datasets: [
      { label: 'Entries', data: hours.map((h) => dashboard?.hourly?.[h]?.entries || 0), backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 4 },
      { label: 'Exits', data: hours.map((h) => dashboard?.hourly?.[h]?.exits || 0), backgroundColor: 'rgba(91,140,255,0.75)', borderRadius: 4 },
    ],
  };

  return (
    <div className="dark min-h-screen bg-ink-900 text-ink-100">
      <header className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-4 md:px-10">
        <div className="flex items-center gap-3">
          {dashboard?.collegeLogo ? (
            <img src={dashboard.collegeLogo} alt="" className="h-9 w-9 rounded-lg object-contain" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10">
              <span className="h-2 w-2 rounded-full bg-cyan-300" />
            </span>
          )}
          <div>
            <div className="font-display text-lg font-semibold text-white">{dashboard?.collegeName || 'Campus'}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">Live campus status · public view</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className={connected ? 'chip-ok' : 'chip-warn'}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'animate-pulse bg-emerald-400' : 'bg-amber-400'}`} />
            {connected ? 'Live' : 'Reconnecting'}
          </span>
          <Clock />
        </div>
      </header>

      {error && <p className="mx-6 mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200 md:mx-10">{error}</p>}

      <main className="grid gap-6 p-6 md:p-10 xl:grid-cols-[1.6fr_1fr]">
        <section className="relative min-h-[420px] overflow-hidden rounded-3xl border border-white/5">
          <CampusStage focus="command" status={status} className="absolute inset-0" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-900/90 via-ink-900/30 to-transparent" />
          <div className="relative flex h-full flex-col justify-between p-8">
            <div>
              <p className="eyebrow mb-3">Inside campus now</p>
              <div className="metric text-7xl text-white md:text-8xl" aria-live="polite">
                {dashboard ? (dashboard.currentlyInside || 0).toLocaleString('en-IN') : '—'}
              </div>
            </div>
            <div className="grid max-w-md grid-cols-3 gap-6">
              <div>
                <div className={`metric text-3xl ${online === total && total ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {dashboard ? `${online}/${total}` : '—'}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Gates online</div>
              </div>
              <div>
                <div className="metric text-3xl text-red-300">{dashboard?.unauthorizedCount ?? '—'}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Unauthorised today</div>
              </div>
              <div>
                <div className="metric text-3xl text-amber-300">{dashboard?.blockedCount ?? '—'}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">Denied today</div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel flex flex-col p-6" aria-live="polite" aria-label="Recent gate activity">
          <p className="eyebrow mb-4">Gate activity</p>
          {stream.length === 0 ? (
            <p className="text-sm text-ink-400">No movement recorded yet today.</p>
          ) : (
            <ul className="space-y-2">
              {stream.map((event) => {
                const [dot, label] = EVENT_META[event.eventType] || EVENT_META.entry;
                return (
                  <li key={event.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                    <span className="flex-1 text-sm text-white">{label}</span>
                    <span className="truncate font-mono text-[11px] text-ink-400">{event.terminalLabel || event.gateName}</span>
                    <span className="font-mono text-[11px] tabular-nums text-ink-300">{time(event.time)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel p-6 xl:col-span-1">
          <p className="eyebrow mb-4">Today by hour</p>
          <div className="h-56">
            <Bar
              data={chartData}
              options={{
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#b5c0d0', boxWidth: 10 } } },
                scales: {
                  x: { ticks: { color: '#8593a8' }, grid: { display: false } },
                  y: { ticks: { color: '#8593a8', precision: 0 }, grid: { color: 'rgba(148,170,210,0.08)' } },
                },
              }}
            />
          </div>
        </section>

        <section className="panel p-6">
          <p className="eyebrow mb-4">Terminals</p>
          <ul className="space-y-2">
            {(dashboard?.terminals || []).map((t) => (
              <li key={t.machineNumber} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 px-3 py-2">
                <div>
                  <div className="text-sm text-white">{t.terminalLabel}</div>
                  <div className="font-mono text-[10px] text-ink-400">
                    {t.deviceRole === 'GATE_ENTRY' ? 'ENTRY' : t.deviceRole === 'GATE_EXIT' ? 'EXIT' : 'GATE'} · {t.scansToday || 0} scans today
                  </div>
                </div>
                <span className={t.isOnline ? 'chip-ok' : 'chip-off'}>{t.isOnline ? 'Online' : 'Offline'}</span>
              </li>
            ))}
            {!dashboard?.terminals?.length && <li className="text-sm text-ink-400">No gate terminals registered.</li>}
          </ul>
          {dashboard?.hostelOutsideCounts?.length > 0 && (
            <>
              <p className="eyebrow mb-3 mt-6">Hostellers outside</p>
              <ul className="grid grid-cols-2 gap-2">
                {dashboard.hostelOutsideCounts.map((h) => (
                  <li key={h.hostelName} className="rounded-xl border border-white/5 px-3 py-2">
                    <div className="metric text-2xl text-white">{h.count}</div>
                    <div className="text-xs text-ink-400">{h.hostelName}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-6 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400 md:px-10">
        <span>Anonymous view · no names or IDs are shown</span>
        <Link to="/" className="hover:text-white">
          Sentinel platform
        </Link>
      </footer>
    </div>
  );
}
