import { useState, useEffect } from 'react';
import { getDashboardApi, getHourlyApi } from '../services/api';
import StatCard from '../components/StatCard';
import {
  HiOutlineUsers,
  HiOutlineLogin,
  HiOutlineLogout,
  HiOutlineExclamationCircle,
  HiOutlineOfficeBuilding,
  HiOutlineClock,
  HiOutlineUserGroup,
  HiOutlineMoon,
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

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  Title, Tooltip, Legend, Filler
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState('currentlyInside');

  useEffect(() => {
    const load = async () => {
      try {
        const [dashRes, hourlyRes] = await Promise.all([
          getDashboardApi(),
          getHourlyApi(),
        ]);
        setStats(dashRes.data);
        setHourly(hourlyRes.data);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!stats) return <p className="text-gray-500">Failed to load dashboard data.</p>;

  const today = stats.todayStats;
  const studentGroups = stats.studentGroups || {};
  const drilldownConfig = {
    totalStudents: {
      title: 'All Active Students',
      empty: 'No active students found.',
    },
    enteredToday: {
      title: 'Students With Entries Today',
      empty: 'No students have entered today.',
    },
    exitedToday: {
      title: 'Students With Exits Today',
      empty: 'No students have exited today.',
    },
    uniqueEntries: {
      title: 'Students Seen Today',
      empty: 'No students have been scanned today.',
    },
    currentlyInside: {
      title: 'Students Currently Inside',
      empty: 'No students are currently marked inside campus.',
    },
    hostellersOutside: {
      title: 'Hostellers Currently Outside',
      empty: 'No hostellers are currently outside.',
    },
    lateReturns: {
      title: 'Late Return Students',
      empty: 'No late-return students found for today.',
    },
  };
  const selectedStudents = studentGroups[selectedGroup] || [];

  // Hourly distribution chart
  const hourlyLabels = Array.from({ length: 24 }, (_, i) =>
    i.toString().padStart(2, '0') + ':00'
  );
  const hourlyData = {
    labels: hourlyLabels,
    datasets: [
      {
        label: 'Entries',
        data: hourlyLabels.map((_, i) => hourly?.[i]?.entries || 0),
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
      },
      {
        label: 'Exits',
        data: hourlyLabels.map((_, i) => hourly?.[i]?.exits || 0),
        backgroundColor: 'rgba(239, 68, 68, 0.5)',
      },
    ],
  };

  // Weekly trend chart
  const weeklyData = {
    labels: stats.weeklyTrend.map((d) => {
      const date = new Date(d.date + 'T00:00:00');
      return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: 'Unique Students',
        data: stats.weeklyTrend.map((d) => d.uniqueStudents),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Total Scans',
        data: stats.weeklyTrend.map((d) => d.entries),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Students"
          value={stats.totalStudents}
          subtitle={`${stats.totalDayScholars} Day / ${stats.totalHostellers} Hostel`}
          icon={HiOutlineUsers}
          color="blue"
          onClick={() => setSelectedGroup('totalStudents')}
          active={selectedGroup === 'totalStudents'}
        />
        <StatCard
          title="Currently Inside"
          value={today.currentlyInside}
          subtitle={`of ${today.uniqueEntries} entered today`}
          icon={HiOutlineOfficeBuilding}
          color="green"
          onClick={() => setSelectedGroup('currentlyInside')}
          active={selectedGroup === 'currentlyInside'}
        />
        <StatCard
          title="Entries Today"
          value={today.enteredToday}
          icon={HiOutlineLogin}
          color="indigo"
          onClick={() => setSelectedGroup('enteredToday')}
          active={selectedGroup === 'enteredToday'}
        />
        <StatCard
          title="Exits Today"
          value={today.exitedToday}
          icon={HiOutlineLogout}
          color="purple"
          onClick={() => setSelectedGroup('exitedToday')}
          active={selectedGroup === 'exitedToday'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Unauthorized Attempts"
          value={today.unauthorizedAttempts}
          icon={HiOutlineExclamationCircle}
          color="red"
        />
        <StatCard
          title="Hostellers Outside"
          value={today.hostellersOutside}
          icon={HiOutlineUserGroup}
          color="yellow"
          onClick={() => setSelectedGroup('hostellersOutside')}
          active={selectedGroup === 'hostellersOutside'}
        />
        <StatCard
          title="Late Returns"
          value={today.lateReturns}
          icon={HiOutlineMoon}
          color="red"
          onClick={() => setSelectedGroup('lateReturns')}
          active={selectedGroup === 'lateReturns'}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-gray-800">{drilldownConfig[selectedGroup].title}</h3>
            <p className="text-sm text-gray-500">{selectedStudents.length} students</p>
          </div>
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-primary-50 text-primary-700">
            Click any highlighted card to switch this list
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">SAP ID</th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Department</th>
                <th className="text-left px-4 py-3 font-medium">Year</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Last Scan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {selectedStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    {drilldownConfig[selectedGroup].empty}
                  </td>
                </tr>
              ) : (
                selectedStudents.map((student) => (
                  <tr key={student.sapId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono">{student.sapId}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{student.name}</td>
                    <td className="px-4 py-3 capitalize">{student.category.replace('_', ' ')}</td>
                    <td className="px-4 py-3">{student.department}</td>
                    <td className="px-4 py-3">{student.year || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          student.latestStatus === 'entered'
                            ? 'bg-green-100 text-green-700'
                            : student.latestStatus === 'exited'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {student.latestStatus === 'entered'
                          ? 'Inside'
                          : student.latestStatus === 'exited'
                          ? 'Outside'
                          : 'No Activity'}
                      </span>
                      {student.lateReturn && (
                        <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                          Late
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {student.lastScan
                        ? new Date(student.lastScan).toLocaleTimeString()
                        : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <HiOutlineClock className="w-5 h-5" /> Entry/Exit Distribution (Today)
          </h3>
          <Bar
            data={hourlyData}
            options={{
              responsive: true,
              scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
              },
            }}
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Weekly Attendance Trend</h3>
          <Line
            data={weeklyData}
            options={{
              responsive: true,
              scales: {
                y: { beginAtZero: true },
              },
            }}
          />
        </div>
      </div>

      {/* Peak hours */}
      {Object.keys(stats.peakHours).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-3">Peak Entry Hours</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.peakHours)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([hour, count]) => (
                <span
                  key={hour}
                  className="px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium"
                >
                  {hour.padStart(2, '0')}:00 — {count} entries
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
