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
        />
        <StatCard
          title="Currently Inside"
          value={today.currentlyInside}
          subtitle={`of ${today.uniqueEntries} entered today`}
          icon={HiOutlineOfficeBuilding}
          color="green"
        />
        <StatCard
          title="Entries Today"
          value={today.enteredToday}
          icon={HiOutlineLogin}
          color="indigo"
        />
        <StatCard
          title="Exits Today"
          value={today.exitedToday}
          icon={HiOutlineLogout}
          color="purple"
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
        />
        <StatCard
          title="Late Returns"
          value={today.lateReturns}
          icon={HiOutlineMoon}
          color="red"
        />
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
