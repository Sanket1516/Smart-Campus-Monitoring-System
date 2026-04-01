import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineChartBar,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineLogin,
  HiOutlineLogout,
  HiOutlineOfficeBuilding,
  HiOutlineServer,
  HiOutlineShieldExclamation,
  HiOutlineUserGroup,
  HiOutlineUsers,
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
import { Bar, Line } from 'react-chartjs-2';
import toast from 'react-hot-toast';
import StatCard from '../components/StatCard';
import { useSocket } from '../context/SocketContext';
import {
  getDashboardApi,
  getHostelsApi,
  getHourlyApi,
  getTerminalStatusApi,
} from '../services/api';

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

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Never';

const formatFeedItem = (event) => {
  const time = new Date(event.time).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (event.eventType === 'unauthorized' || event.type === 'unauthorized') {
    return `Unknown — Unauthorized — ${event.gateName || 'Gate'} — ${time}`;
  }

  return `${event.studentName || 'Student'} — ${(event.type || 'scan').toUpperCase()} — ${
    event.gateName || 'Gate'
  } Terminal ${event.terminalNumber ?? '-'} — ${time}`;
};

const buildLiveEvent = (payload) => ({
  id: `live-${Date.now()}-${Math.random()}`,
  type: payload.type,
  eventType: 'authorized',
  studentName: payload.studentName,
  sapId: payload.sapId,
  hostelName: payload.hostelName,
  gateName: payload.gateName,
  gateNumber: payload.gateNumber,
  terminalNumber: payload.terminalNumber,
  terminalLabel: payload.terminalLabel,
  machineNumber: payload.machineNumber,
  time: payload.time || new Date().toISOString(),
});

const buildUnauthorizedEvent = (payload) => ({
  id: `unauthorized-${Date.now()}-${Math.random()}`,
  type: 'unauthorized',
  eventType: 'unauthorized',
  gateName: payload.gateName,
  gateNumber: payload.gateNumber,
  terminalNumber: payload.terminalNumber,
  terminalLabel: payload.terminalLabel,
  machineNumber: payload.machineNumber,
  time: payload.time || new Date().toISOString(),
});

const groupTerminalStatuses = (terminals) => {
  return terminals.reduce((acc, terminal) => {
    const key = terminal.isEnrollmentStation
      ? 'Enrollment Station'
      : `${terminal.gateName} (Gate ${terminal.gateNumber})`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(terminal);
    return acc;
  }, {});
};

export default function Dashboard() {
  const { socket } = useSocket();
  const feedContainerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hostels, setHostels] = useState([]);
  const [selectedHostelId, setSelectedHostelId] = useState('all');
  const [dashboard, setDashboard] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [terminals, setTerminals] = useState([]);

  const selectedHostel = useMemo(
    () => hostels.find((hostel) => hostel._id === selectedHostelId) || null,
    [hostels, selectedHostelId]
  );

  const loadDashboard = async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    const hostelParam = selectedHostelId !== 'all' ? selectedHostelId : undefined;

    try {
      const [dashboardRes, hourlyRes, hostelsRes, terminalRes] = await Promise.all([
        getDashboardApi({ hostelId: hostelParam }),
        getHourlyApi({ hostelId: hostelParam }),
        getHostelsApi(),
        getTerminalStatusApi(),
      ]);

      setDashboard(dashboardRes.data);
      setHourly(hourlyRes.data);
      setHostels(hostelsRes.data.hostels || []);
      setTerminals(terminalRes.data.terminals || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(() => loadDashboard({ silent: true }), 30000);
    return () => clearInterval(interval);
  }, [selectedHostelId]);

  useEffect(() => {
    if (feedContainerRef.current) {
      feedContainerRef.current.scrollTop = 0;
    }
  }, [dashboard?.liveActivity]);

  useEffect(() => {
    if (!socket) return undefined;

    const matchesSelectedHostel = (hostelName) =>
      selectedHostelId === 'all' || hostelName === selectedHostel?.name;

    const updateHourly = (type, time) => {
      const hour = new Date(time).getHours();
      setHourly((current) => ({
        ...(current || {}),
        [hour]: {
          entries: (current?.[hour]?.entries || 0) + (type === 'entry' ? 1 : 0),
          exits: (current?.[hour]?.exits || 0) + (type === 'exit' ? 1 : 0),
        },
      }));
    };

    const updateGateActivity = (payload, unauthorized = false) => {
      setDashboard((current) => {
        if (!current) return current;
        const activity = [...(current.gateActivity || [])];
        const index = activity.findIndex((item) => item.gateName === payload.gateName);

        if (index === -1) {
          activity.push({
            gateName: payload.gateName || 'Unknown Gate',
            entries: unauthorized ? 0 : payload.type === 'entry' ? 1 : 0,
            exits: unauthorized ? 0 : payload.type === 'exit' ? 1 : 0,
            unauthorized: unauthorized ? 1 : 0,
          });
        } else {
          activity[index] = {
            ...activity[index],
            entries: activity[index].entries + (!unauthorized && payload.type === 'entry' ? 1 : 0),
            exits: activity[index].exits + (!unauthorized && payload.type === 'exit' ? 1 : 0),
            unauthorized: activity[index].unauthorized + (unauthorized ? 1 : 0),
          };
        }

        return { ...current, gateActivity: activity };
      });
    };

    const updateHostelMovement = (payload) => {
      if (!payload.hostelName) return;

      setDashboard((current) => {
        if (!current) return current;
        const rows = [...(current.hostelMovement || [])];
        const index = rows.findIndex((row) => row.hostelName === payload.hostelName);

        if (index === -1) return current;

        const row = { ...rows[index] };
        if (payload.type === 'entry') {
          row.entries += 1;
          row.inside += 1;
          row.outside = Math.max(0, row.outside - 1);
        } else if (payload.type === 'exit') {
          row.exits += 1;
          row.outside += 1;
          row.inside = Math.max(0, row.inside - 1);
        }

        rows[index] = row;
        const hostelMetrics =
          current.hostelMetrics?.hostelName === payload.hostelName ? row : current.hostelMetrics;

        return { ...current, hostelMovement: rows, hostelMetrics };
      });
    };

    const updateFeed = (event) => {
      setDashboard((current) => {
        if (!current) return current;
        return {
          ...current,
          liveActivity: [event, ...(current.liveActivity || [])].slice(0, 50),
        };
      });
    };

    const handleScanLive = (payload) => {
      if (!matchesSelectedHostel(payload.hostelName)) return;

      updateFeed(buildLiveEvent(payload));
      updateHourly(payload.type, payload.time);
      updateGateActivity(payload, false);
      updateHostelMovement(payload);

      setDashboard((current) => {
        if (!current) return current;
        const todayStats = { ...(current.todayStats || {}) };
        if (payload.type === 'entry') {
          todayStats.enteredToday = (todayStats.enteredToday || 0) + 1;
          todayStats.currentlyInside = (todayStats.currentlyInside || 0) + 1;
        } else if (payload.type === 'exit') {
          todayStats.exitedToday = (todayStats.exitedToday || 0) + 1;
          todayStats.currentlyInside = Math.max(0, (todayStats.currentlyInside || 0) - 1);
        }
        todayStats.totalScans = (todayStats.totalScans || 0) + 1;
        return { ...current, todayStats };
      });
    };

    const handleUnauthorized = (payload) => {
      if (selectedHostelId !== 'all') return;
      updateFeed(buildUnauthorizedEvent(payload));
      updateGateActivity(payload, true);
      setDashboard((current) => {
        if (!current) return current;
        return {
          ...current,
          todayStats: {
            ...(current.todayStats || {}),
            unauthorizedAttempts: (current.todayStats?.unauthorizedAttempts || 0) + 1,
          },
        };
      });
    };

    const handleBlocked = (payload) => {
      if (!matchesSelectedHostel(payload.hostelName)) return;
      setDashboard((current) => {
        if (!current) return current;
        return {
          ...current,
          todayStats: {
            ...(current.todayStats || {}),
            blockedAttemptsToday: (current.todayStats?.blockedAttemptsToday || 0) + 1,
          },
        };
      });
    };

    const handleTerminalStatus = (payload, isOnline) => {
      setTerminals((current) =>
        current.map((terminal) =>
          terminal.machineNumber === payload.machineNumber
            ? {
                ...terminal,
                isOnline,
                lastSeen: payload.lastSeen || new Date().toISOString(),
              }
            : terminal
        )
      );
    };

    socket.on('scan:live', handleScanLive);
    socket.on('scan:unauthorized', handleUnauthorized);
    socket.on('scan:blocked', handleBlocked);
    socket.on('terminal:online', (payload) => handleTerminalStatus(payload, true));
    socket.on('terminal:offline', (payload) => handleTerminalStatus(payload, false));

    return () => {
      socket.off('scan:live', handleScanLive);
      socket.off('scan:unauthorized', handleUnauthorized);
      socket.off('scan:blocked', handleBlocked);
      socket.off('terminal:online');
      socket.off('terminal:offline');
    };
  }, [socket, selectedHostelId, selectedHostel]);

  const hourlyData = useMemo(
    () => ({
      labels: hourlyLabels,
      datasets: [
        {
          label: 'Entries',
          data: hourlyLabels.map((_, i) => hourly?.[i]?.entries || 0),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.18)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Exits',
          data: hourlyLabels.map((_, i) => hourly?.[i]?.exits || 0),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          fill: true,
          tension: 0.3,
        },
      ],
    }),
    [hourly]
  );

  const gateChartData = useMemo(
    () => ({
      labels: (dashboard?.gateActivity || []).map((item) => item.gateName),
      datasets: [
        {
          label: 'Entries',
          data: (dashboard?.gateActivity || []).map((item) => item.entries || 0),
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
        },
        {
          label: 'Exits',
          data: (dashboard?.gateActivity || []).map((item) => item.exits || 0),
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
        },
        {
          label: 'Unauthorized',
          data: (dashboard?.gateActivity || []).map((item) => item.unauthorized || 0),
          backgroundColor: 'rgba(245, 158, 11, 0.75)',
        },
      ],
    }),
    [dashboard]
  );

  const hostelChartData = useMemo(
    () => ({
      labels: (dashboard?.hostelMovement || []).map((item) => item.hostelName),
      datasets: [
        {
          label: 'Entries',
          data: (dashboard?.hostelMovement || []).map((item) => item.entries || 0),
          backgroundColor: 'rgba(99, 102, 241, 0.8)',
        },
        {
          label: 'Exits',
          data: (dashboard?.hostelMovement || []).map((item) => item.exits || 0),
          backgroundColor: 'rgba(244, 114, 182, 0.75)',
        },
      ],
    }),
    [dashboard]
  );

  const groupedTerminals = useMemo(() => groupTerminalStatuses(terminals), [terminals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!dashboard) {
    return <p className="text-gray-500">Failed to load dashboard data.</p>;
  }

  const today = dashboard.todayStats || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="text-sm text-gray-500">
            One system, multiple views. Monitor gates, hostels, live scans, and approvals in one place.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={selectedHostelId}
            onChange={(e) => setSelectedHostelId(e.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Campus</option>
            {hostels.map((hostel) => (
              <option key={hostel._id} value={hostel._id}>
                {hostel.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadDashboard({ silent: true })}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {refreshing ? 'Refreshing...' : 'Refresh View'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="Inside Campus" value={today.currentlyInside || 0} icon={HiOutlineOfficeBuilding} color="green" />
        <StatCard title="Entries Today" value={today.enteredToday || 0} icon={HiOutlineLogin} color="blue" />
        <StatCard title="Exits Today" value={today.exitedToday || 0} icon={HiOutlineLogout} color="indigo" />
        <StatCard title="Unauthorized" value={today.unauthorizedAttempts || 0} icon={HiOutlineExclamationCircle} color="yellow" />
        <StatCard title="Blocked Attempts" value={today.blockedAttemptsToday || 0} icon={HiOutlineShieldExclamation} color="red" />
        <StatCard title="Active Approvals" value={today.activeHostellerApprovals || 0} icon={HiOutlineUserGroup} color="purple" />
      </div>

      {dashboard.hostelMetrics && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="mb-4 flex items-center gap-3">
            <HiOutlineUsers className="h-6 w-6 text-blue-700" />
            <div>
              <h2 className="text-lg font-semibold text-blue-900">{dashboard.hostelMetrics.hostelName} Metrics</h2>
              <p className="text-sm text-blue-700">Filtered hostel view across dashboard widgets.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-xl bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Inside</p>
              <p className="mt-2 text-2xl font-bold text-gray-800">{dashboard.hostelMetrics.inside || 0}</p>
            </div>
            <div className="rounded-xl bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Outside</p>
              <p className="mt-2 text-2xl font-bold text-gray-800">{dashboard.hostelMetrics.outside || 0}</p>
            </div>
            <div className="rounded-xl bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Late</p>
              <p className="mt-2 text-2xl font-bold text-red-700">{dashboard.hostelMetrics.late || 0}</p>
            </div>
            <div className="rounded-xl bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Approved</p>
              <p className="mt-2 text-2xl font-bold text-indigo-700">{dashboard.hostelMetrics.approved || 0}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm 2xl:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800">
            <HiOutlineClock className="h-5 w-5" />
            Hourly Entry / Exit
          </h2>
          <Line
            data={hourlyData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom' } },
              scales: { y: { beginAtZero: true } },
            }}
            height={300}
          />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm 2xl:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800">
            <HiOutlineChartBar className="h-5 w-5" />
            Gate-wise Activity
          </h2>
          <Bar
            data={gateChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom' } },
              scales: { y: { beginAtZero: true } },
            }}
            height={300}
          />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm 2xl:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800">
            <HiOutlineUserGroup className="h-5 w-5" />
            Hostel-wise Movement
          </h2>
          <Bar
            data={hostelChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom' } },
              scales: { y: { beginAtZero: true } },
            }}
            height={300}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Live Activity Feed</h2>
              <p className="text-sm text-gray-500">Last 50 scan events, updated in real time.</p>
            </div>
            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
              Auto-updating
            </span>
          </div>
          <div ref={feedContainerRef} className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {(dashboard.liveActivity || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                No recent activity for the selected view.
              </div>
            ) : (
              dashboard.liveActivity.map((event) => (
                <div
                  key={event.id}
                  className={`rounded-xl border px-4 py-3 ${
                    event.eventType === 'unauthorized'
                      ? 'border-orange-200 bg-orange-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-gray-800">{formatFeedItem(event)}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {event.hostelName ? `${event.hostelName} • ` : ''}
                    {event.terminalLabel || `Machine #${event.machineNumber ?? '-'}`}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Gate Status</h2>
            <p className="text-sm text-gray-500">Live terminal health, scan counts, and last-seen status.</p>
          </div>
          <div className="max-h-[520px] space-y-5 overflow-y-auto pr-1">
            {Object.entries(groupedTerminals).map(([groupName, items]) => (
              <div key={groupName} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{groupName}</h3>
                {items.map((terminal) => (
                  <div
                    key={terminal.machineNumber}
                    className={`rounded-xl border px-4 py-4 ${
                      terminal.isOnline ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-800">{terminal.terminalLabel}</p>
                        <p className="text-sm text-gray-500">
                          Machine #{terminal.machineNumber} • {terminal.deviceSN}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          terminal.isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {terminal.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-700">
                      <p><span className="font-semibold">Scans Today:</span> {terminal.scansToday}</p>
                      <p><span className="font-semibold">Total Scans:</span> {terminal.totalScans}</p>
                      <p className="col-span-2"><span className="font-semibold">Last Seen:</span> {formatDateTime(terminal.lastSeen)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
