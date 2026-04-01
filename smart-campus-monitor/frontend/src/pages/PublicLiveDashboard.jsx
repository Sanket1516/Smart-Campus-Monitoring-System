import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineOfficeBuilding,
  HiOutlineShieldExclamation,
  HiOutlineStatusOnline,
} from 'react-icons/hi';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { getPublicLiveDashboardApi } from '../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const hourlyLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

const deriveSocketUrl = () => {
  const configured = import.meta.env.VITE_SOCKET_URL;
  if (configured) return configured;

  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl || apiUrl.startsWith('/')) return undefined;

  return apiUrl.replace(/\/api\/?$/, '');
};

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Never';

const formatActivityText = (event) => {
  const time = new Date(event.time).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (event.eventType === 'unauthorized') {
    return `Unauthorized - ${event.gateName || 'Gate'} Terminal ${event.terminalNumber ?? '-'} - ${time}`;
  }

  return `${String(event.eventType || 'scan').toUpperCase()} - ${event.gateName || 'Gate'} Terminal ${
    event.terminalNumber ?? '-'
  } - ${time}`;
};

const buildScanEvent = (payload) => ({
  id: `public-live-${Date.now()}-${Math.random()}`,
  eventType: payload.type || 'scan',
  gateName: payload.gateName,
  gateNumber: payload.gateNumber,
  terminalNumber: payload.terminalNumber,
  terminalLabel: payload.terminalLabel,
  machineNumber: payload.machineNumber,
  time: payload.time || new Date().toISOString(),
  hostelName: payload.hostelName || '',
  studentType: payload.studentType || '',
});

const buildUnauthorizedEvent = (payload) => ({
  id: `public-unauthorized-${Date.now()}-${Math.random()}`,
  eventType: 'unauthorized',
  gateName: payload.gateName,
  gateNumber: payload.gateNumber,
  terminalNumber: payload.terminalNumber,
  terminalLabel: payload.terminalLabel,
  machineNumber: payload.machineNumber,
  time: payload.time || new Date().toISOString(),
});

const extractSettingValue = (value, fallback = '') => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return value.collegeName || value.collegeLogo || value.logo || value.name || value.url || fallback;
};

export default function PublicLiveDashboard() {
  const socketRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [dashboard, setDashboard] = useState(null);

  const groupedTerminals = useMemo(
    () =>
      (dashboard?.terminals || []).reduce((acc, terminal) => {
        const key = `${terminal.gateName} (Gate ${terminal.gateNumber})`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(terminal);
        return acc;
      }, {}),
    [dashboard]
  );

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getPublicLiveDashboardApi();
        setDashboard(res.data);
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to load public dashboard');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const socket = io(deriveSocketUrl(), {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    const updateTerminal = (payload, isOnline) => {
      setDashboard((current) => {
        if (!current) return current;
        return {
          ...current,
          terminals: (current.terminals || []).map((terminal) =>
            terminal.machineNumber === payload.machineNumber
              ? {
                  ...terminal,
                  isOnline,
                  lastSeen: payload.lastSeen || new Date().toISOString(),
                }
              : terminal
          ),
        };
      });
    };

    const updateHourly = (type, time) => {
      const hour = new Date(time || new Date()).getHours();
      setDashboard((current) => {
        if (!current) return current;
        return {
          ...current,
          hourly: {
            ...(current.hourly || {}),
            [hour]: {
              entries: (current.hourly?.[hour]?.entries || 0) + (type === 'entry' ? 1 : 0),
              exits: (current.hourly?.[hour]?.exits || 0) + (type === 'exit' ? 1 : 0),
            },
          },
        };
      });
    };

    const handleScanLive = (payload) => {
      const event = buildScanEvent(payload);
      setDashboard((current) => {
        if (!current) return current;

        const nextHostelCounts = [...(current.hostelOutsideCounts || [])];
        if (payload.hostelName && payload.studentType === 'hosteller') {
          const index = nextHostelCounts.findIndex((item) => item.hostelName === payload.hostelName);
          if (index === -1) {
            nextHostelCounts.push({
              hostelName: payload.hostelName,
              count: payload.type === 'exit' ? 1 : 0,
            });
          } else {
            nextHostelCounts[index] = {
              ...nextHostelCounts[index],
              count:
                payload.type === 'exit'
                  ? nextHostelCounts[index].count + 1
                  : Math.max(0, nextHostelCounts[index].count - 1),
            };
          }
        }

        return {
          ...current,
          currentlyInside:
            payload.type === 'entry'
              ? (current.currentlyInside || 0) + 1
              : Math.max(0, (current.currentlyInside || 0) - 1),
          liveActivity: [event, ...(current.liveActivity || [])].slice(0, 20),
          hostelOutsideCounts: nextHostelCounts.sort((a, b) => a.hostelName.localeCompare(b.hostelName)),
        };
      });

      updateHourly(payload.type, payload.time);
    };

    const handleUnauthorized = (payload) => {
      const event = buildUnauthorizedEvent(payload);
      setDashboard((current) => {
        if (!current) return current;
        return {
          ...current,
          unauthorizedCount: (current.unauthorizedCount || 0) + 1,
          liveActivity: [event, ...(current.liveActivity || [])].slice(0, 20),
        };
      });
    };

    const handleBlocked = () => {
      setDashboard((current) => {
        if (!current) return current;
        return {
          ...current,
          blockedCount: (current.blockedCount || 0) + 1,
        };
      });
    };

    const handleSettingsUpdated = (payload) => {
      const key = String(payload?.key || '').toLowerCase();
      setDashboard((current) => {
        if (!current) return current;

        if (key.includes('college') && key.includes('name')) {
          return {
            ...current,
            collegeName: extractSettingValue(payload.newValue, current.collegeName),
          };
        }

        if (key.includes('logo')) {
          return {
            ...current,
            collegeLogo: extractSettingValue(payload.newValue, current.collegeLogo),
          };
        }

        return current;
      });
    };

    socket.on('scan:live', handleScanLive);
    socket.on('scan:unauthorized', handleUnauthorized);
    socket.on('scan:blocked', handleBlocked);
    socket.on('terminal:online', (payload) => updateTerminal(payload, true));
    socket.on('terminal:offline', (payload) => updateTerminal(payload, false));
    socket.on('settings:updated', handleSettingsUpdated);

    return () => {
      socket.off('scan:live', handleScanLive);
      socket.off('scan:unauthorized', handleUnauthorized);
      socket.off('scan:blocked', handleBlocked);
      socket.off('terminal:online');
      socket.off('terminal:offline');
      socket.off('settings:updated', handleSettingsUpdated);
      socket.disconnect();
    };
  }, []);

  const hourlyData = useMemo(
    () => ({
      labels: hourlyLabels,
      datasets: [
        {
          label: 'Entries',
          data: hourlyLabels.map((_, i) => dashboard?.hourly?.[i]?.entries || 0),
          borderColor: 'rgb(22, 163, 74)',
          backgroundColor: 'rgba(22, 163, 74, 0.18)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Exits',
          data: hourlyLabels.map((_, i) => dashboard?.hourly?.[i]?.exits || 0),
          borderColor: 'rgb(37, 99, 235)',
          backgroundColor: 'rgba(37, 99, 235, 0.15)',
          fill: true,
          tension: 0.3,
        },
      ],
    }),
    [dashboard]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-white" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-white">
        Unable to load the public live dashboard right now.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.24),_transparent_32%),linear-gradient(180deg,#020617_0%,#0f172a_40%,#111827_100%)] px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {dashboard.collegeLogo ? (
              <img
                src={dashboard.collegeLogo}
                alt={dashboard.collegeName}
                className="h-16 w-16 rounded-2xl border border-white/10 bg-white/10 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/20 text-2xl font-bold text-cyan-100">
                {(dashboard.collegeName || 'CL')
                  .split(' ')
                  .slice(0, 2)
                  .map((part) => part[0] || '')
                  .join('')
                  .toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/80">Public Live View</p>
              <h1 className="text-3xl font-bold">{dashboard.collegeName}</h1>
              <p className="mt-1 text-sm text-slate-300">
                Read-only campus movement and terminal visibility without sensitive student details.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start rounded-full border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-200">
            <span
              className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.8)]' : 'bg-red-400'}`}
            />
            {connected ? 'Live socket connected' : 'Reconnecting to live feed'}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/10 p-5">
            <div className="flex items-center gap-3">
              <HiOutlineOfficeBuilding className="h-6 w-6 text-emerald-300" />
              <p className="text-sm text-emerald-100/80">Inside Campus</p>
            </div>
            <p className="mt-4 text-4xl font-bold">{dashboard.currentlyInside || 0}</p>
          </div>

          <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/10 p-5">
            <div className="flex items-center gap-3">
              <HiOutlineExclamationCircle className="h-6 w-6 text-amber-300" />
              <p className="text-sm text-amber-100/80">Unauthorized Today</p>
            </div>
            <p className="mt-4 text-4xl font-bold">{dashboard.unauthorizedCount || 0}</p>
          </div>

          <div className="rounded-[24px] border border-rose-400/20 bg-rose-400/10 p-5">
            <div className="flex items-center gap-3">
              <HiOutlineShieldExclamation className="h-6 w-6 text-rose-300" />
              <p className="text-sm text-rose-100/80">Blocked Attempts Today</p>
            </div>
            <p className="mt-4 text-4xl font-bold">{dashboard.blockedCount || 0}</p>
          </div>

          <div className="rounded-[24px] border border-sky-400/20 bg-sky-400/10 p-5">
            <div className="flex items-center gap-3">
              <HiOutlineStatusOnline className="h-6 w-6 text-sky-300" />
              <p className="text-sm text-sky-100/80">Terminals Online</p>
            </div>
            <p className="mt-4 text-4xl font-bold">
              {(dashboard.terminals || []).filter((terminal) => terminal.isOnline).length}
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,0.8fr]">
          <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="mb-4 flex items-center gap-3">
              <HiOutlineClock className="h-6 w-6 text-cyan-300" />
              <div>
                <h2 className="text-xl font-semibold">Today&apos;s Hourly Movement</h2>
                <p className="text-sm text-slate-300">Live entry and exit trend across the campus.</p>
              </div>
            </div>
            <div className="h-[320px]">
              <Line
                data={hourlyData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: { color: '#e2e8f0' },
                    },
                  },
                  scales: {
                    x: {
                      ticks: { color: '#cbd5e1' },
                      grid: { color: 'rgba(148, 163, 184, 0.15)' },
                    },
                    y: {
                      beginAtZero: true,
                      ticks: { color: '#cbd5e1' },
                      grid: { color: 'rgba(148, 163, 184, 0.15)' },
                    },
                  },
                }}
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Hostel-wise Outside Count</h2>
              <p className="text-sm text-slate-300">Current hosteller movement by hostel.</p>
            </div>
            <div className="space-y-3">
              {(dashboard.hostelOutsideCounts || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/30 p-6 text-center text-sm text-slate-300">
                  No hostel students are currently marked outside.
                </div>
              ) : (
                dashboard.hostelOutsideCounts.map((item) => (
                  <div
                    key={item.hostelName}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/35 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-white">{item.hostelName}</p>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Currently outside</p>
                    </div>
                    <span className="text-2xl font-bold text-cyan-300">{item.count}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr,1.05fr]">
          <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Live Activity Feed</h2>
              <p className="text-sm text-slate-300">Last 20 gate events with public-safe details only.</p>
            </div>
            <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {(dashboard.liveActivity || []).map((event) => (
                <div
                  key={event.id}
                  className={`rounded-2xl border px-4 py-3 ${
                    event.eventType === 'unauthorized'
                      ? 'border-orange-400/20 bg-orange-400/10'
                      : 'border-white/10 bg-slate-900/35'
                  }`}
                >
                  <p className="font-medium text-white">{formatActivityText(event)}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {event.terminalLabel || `Machine #${event.machineNumber ?? '-'}`}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Gate-wise Terminal Status</h2>
              <p className="text-sm text-slate-300">Online and offline visibility for all gate terminals.</p>
            </div>
            <div className="max-h-[520px] space-y-4 overflow-y-auto pr-1">
              {Object.entries(groupedTerminals).map(([gateLabel, terminals]) => (
                <div key={gateLabel} className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">
                    {gateLabel}
                  </h3>
                  {terminals.map((terminal) => (
                    <article
                      key={terminal.machineNumber}
                      className={`rounded-2xl border px-4 py-4 ${
                        terminal.isOnline
                          ? 'border-emerald-400/20 bg-emerald-400/10'
                          : 'border-rose-400/20 bg-rose-400/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{terminal.terminalLabel}</p>
                          <p className="text-sm text-slate-300">Machine #{terminal.machineNumber}</p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            terminal.isOnline
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {terminal.isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-200">
                        <p>
                          <span className="font-semibold text-white">Gate:</span> {terminal.gateNumber}
                        </p>
                        <p>
                          <span className="font-semibold text-white">Terminal:</span> {terminal.terminalNumber}
                        </p>
                        <p>
                          <span className="font-semibold text-white">Scans Today:</span> {terminal.scansToday || 0}
                        </p>
                        <p className="col-span-2">
                          <span className="font-semibold text-white">Last Seen:</span>{' '}
                          {formatDateTime(terminal.lastSeen)}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
