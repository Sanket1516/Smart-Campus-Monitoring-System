import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineChartBar,
  HiOutlineClock,
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
import DashboardChatWidget from '../components/DashboardChatWidget';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
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

const STUDENT_GROUP_META = {
  currentlyInside: {
    key: 'currentlyInside',
    title: 'Inside Campus Students',
    empty: 'No students are currently inside campus.',
  },
  currentlyOutside: {
    key: 'currentlyOutside',
    title: 'Outside Campus Students',
    empty: 'No students are currently outside campus.',
  },
  totalStudents: {
    key: 'totalStudents',
    title: 'All Students',
    empty: 'No students found for this view.',
  },
  hostellersOutside: {
    key: 'hostellersOutside',
    title: 'Hostellers Outside',
    empty: 'No hostellers are currently outside.',
  },
};

export default function Dashboard() {
  const { admin } = useAuth();
  const { socket } = useSocket();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hostels, setHostels] = useState([]);
  const [selectedHostelId, setSelectedHostelId] = useState('all');
  const [dashboard, setDashboard] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [terminals, setTerminals] = useState([]);
  const [activeStudentGroup, setActiveStudentGroup] = useState('currentlyInside');
  const [showStudentList, setShowStudentList] = useState(true);

  const selectedHostel = useMemo(
    () => hostels.find((hostel) => hostel._id === selectedHostelId) || null,
    [hostels, selectedHostelId]
  );
  const isWardenView = admin?.role === 'warden';

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

    const handleScanLive = (payload) => {
      if (!matchesSelectedHostel(payload.hostelName)) return;

      updateHourly(payload.type, payload.time);
      updateGateActivity(payload, false);
      updateHostelMovement(payload);

      setDashboard((current) => {
        if (!current) return current;
        const todayStats = { ...(current.todayStats || {}) };
        const groups = { ...(current.studentGroups || {}) };
        const currentInside = [...(groups.currentlyInside || [])];
        const currentOutside = [...(groups.currentlyOutside || [])];
        const currentHostellersOutside = [...(groups.hostellersOutside || [])];

        const scanTime = payload.time || new Date().toISOString();
        const studentRow = {
          sapId: payload.sapId,
          name: payload.studentName || 'Student',
          category: payload.studentType || '-',
          department: payload.department || '-',
          year: '-',
          course: '-',
          latestStatus: payload.type === 'entry' ? 'entered' : 'exited',
          lastScan: scanTime,
          lateReturn: false,
        };

        const upsertBySapId = (list, row) => {
          const idx = list.findIndex((item) => item.sapId === row.sapId);
          if (idx === -1) return [row, ...list];
          const next = [...list];
          next[idx] = { ...next[idx], ...row };
          return next;
        };

        const removeBySapId = (list, sapId) => list.filter((item) => item.sapId !== sapId);

        if (payload.type === 'entry') {
          todayStats.currentlyInside = (todayStats.currentlyInside || 0) + 1;
          todayStats.currentlyOutside = Math.max(0, (todayStats.currentlyOutside || 0) - 1);

          groups.currentlyInside = upsertBySapId(currentInside, studentRow);
          groups.currentlyOutside = removeBySapId(currentOutside, payload.sapId);
          if (payload.studentType === 'hosteller') {
            groups.hostellersOutside = removeBySapId(currentHostellersOutside, payload.sapId);
          }
        } else if (payload.type === 'exit') {
          todayStats.currentlyInside = Math.max(0, (todayStats.currentlyInside || 0) - 1);
          todayStats.currentlyOutside = (todayStats.currentlyOutside || 0) + 1;

          groups.currentlyInside = removeBySapId(currentInside, payload.sapId);
          groups.currentlyOutside = upsertBySapId(currentOutside, studentRow);
          if (payload.studentType === 'hosteller') {
            groups.hostellersOutside = upsertBySapId(currentHostellersOutside, studentRow);
          }
        }

        return {
          ...current,
          todayStats,
          studentGroups: groups,
        };
      });
    };

    const handleUnauthorized = (payload) => {
      if (selectedHostelId !== 'all') return;
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
  const studentGroups = dashboard?.studentGroups || {};
  const selectedGroupMeta =
    STUDENT_GROUP_META[activeStudentGroup] || STUDENT_GROUP_META.currentlyInside;
  const selectedStudents = studentGroups[selectedGroupMeta.key] || [];

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
          <h1 className="text-2xl font-bold text-gray-800">
            {isWardenView ? 'Warden Dashboard' : 'Admin Dashboard'}
          </h1>
          <p className="text-sm text-gray-500">
            One system, multiple views. Monitor gates, hostels, live scans, and approvals in one place.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {!isWardenView && (
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
          )}
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
        <StatCard
          title="Inside Campus"
          value={today.currentlyInside || 0}
          icon={HiOutlineOfficeBuilding}
          color="green"
          onClick={() => setActiveStudentGroup('currentlyInside')}
          active={activeStudentGroup === 'currentlyInside'}
        />
        <StatCard
          title="Outside Campus"
          value={today.currentlyOutside || 0}
          icon={HiOutlineUsers}
          color="blue"
          onClick={() => setActiveStudentGroup('currentlyOutside')}
          active={activeStudentGroup === 'currentlyOutside'}
        />
        <StatCard
          title="Total Students"
          value={dashboard.totalStudents || 0}
          icon={HiOutlineUserGroup}
          color="indigo"
          onClick={() => setActiveStudentGroup('totalStudents')}
          active={activeStudentGroup === 'totalStudents'}
        />
        <StatCard
          title="Hostellers Outside"
          value={today.hostellersOutside || 0}
          icon={HiOutlineServer}
          color="orange"
          onClick={() => setActiveStudentGroup('hostellersOutside')}
          active={activeStudentGroup === 'hostellersOutside'}
        />
        <StatCard
          title="Blocked Attempts"
          value={today.blockedAttemptsToday || 0}
          icon={HiOutlineShieldExclamation}
          color="red"
        />
        <StatCard
          title="Active Approvals"
          value={today.activeHostellerApprovals || 0}
          icon={HiOutlineUserGroup}
          color="purple"
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{selectedGroupMeta.title}</h2>
            <p className="text-sm text-gray-500">Count: {selectedStudents.length}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-500">Click cards above to switch the student list.</p>
            <button
              type="button"
              onClick={() => setShowStudentList((current) => !current)}
              className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              {showStudentList ? 'Hide Students' : 'Show Students'}
            </button>
          </div>
        </div>

        {!showStudentList ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
            Student list is hidden. Use the button above to show it again.
          </div>
        ) : selectedStudents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
            {selectedGroupMeta.empty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">SAP ID</th>
                  <th className="px-3 py-2 font-semibold">Department</th>
                  <th className="px-3 py-2 font-semibold">Year</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Last Scan</th>
                </tr>
              </thead>
              <tbody>
                {selectedStudents.map((student) => (
                  <tr
                    key={`${activeStudentGroup}-${student.sapId}`}
                    className="border-b border-gray-100"
                  >
                    <td className="px-3 py-2 font-medium text-gray-800">{student.name || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{student.sapId || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{student.department || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{student.year || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{student.category || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{student.latestStatus || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{formatDateTime(student.lastScan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
          <div className="h-[300px]">
            <Line
              data={hourlyData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } },
              }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm 2xl:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800">
            <HiOutlineChartBar className="h-5 w-5" />
            Gate-wise Activity
          </h2>
          <div className="h-[300px]">
            <Bar
              data={gateChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } },
              }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm 2xl:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800">
            <HiOutlineUserGroup className="h-5 w-5" />
            Hostel-wise Movement
          </h2>
          <div className="h-[300px]">
            <Bar
              data={hostelChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } },
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
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
      <DashboardChatWidget />
    </div>
  );
}
