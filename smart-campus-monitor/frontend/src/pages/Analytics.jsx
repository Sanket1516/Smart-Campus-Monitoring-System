import { useState, useEffect } from 'react';
import { getDashboardApi, getHourlyApi } from '../services/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, Filler
);

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [dashRes, hourlyRes] = await Promise.all([
          getDashboardApi(),
          getHourlyApi(selectedDate),
        ]);
        setStats(dashRes.data);
        setHourly(hourlyRes.data);
      } catch (err) {
        console.error('Analytics load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!stats) return <p className="text-gray-500">Failed to load analytics.</p>;

  // Category breakdown doughnut
  const categoryData = {
    labels: ['Day Scholars', 'Hostellers'],
    datasets: [
      {
        data: [stats.totalDayScholars, stats.totalHostellers],
        backgroundColor: ['rgba(59, 130, 246, 0.8)', 'rgba(139, 92, 246, 0.8)'],
        borderWidth: 0,
      },
    ],
  };

  // Hourly entry/exit chart
  const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
  const hourlyChart = {
    labels: hours,
    datasets: [
      {
        label: 'Entries',
        data: hours.map((_, i) => hourly?.[i]?.entries || 0),
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderRadius: 4,
      },
      {
        label: 'Exits',
        data: hours.map((_, i) => hourly?.[i]?.exits || 0),
        backgroundColor: 'rgba(239, 68, 68, 0.6)',
        borderRadius: 4,
      },
    ],
  };

  // Weekly trend
  const weeklyChart = {
    labels: stats.weeklyTrend.map((d) => {
      const date = new Date(d.date + 'T00:00:00');
      return date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: 'Unique Students',
        data: stats.weeklyTrend.map((d) => d.uniqueStudents),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: 'rgb(59, 130, 246)',
      },
      {
        label: 'Total Scans',
        data: stats.weeklyTrend.map((d) => d.entries),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: 'rgb(16, 185, 129)',
      },
    ],
  };

  // Campus population simulation (cumulative entries - exits by hour)
  const populationData = [];
  let pop = 0;
  for (let h = 0; h < 24; h++) {
    pop += (hourly?.[h]?.entries || 0) - (hourly?.[h]?.exits || 0);
    populationData.push(Math.max(0, pop));
  }

  const populationChart = {
    labels: hours,
    datasets: [
      {
        label: 'Campus Population',
        data: populationData,
        borderColor: 'rgb(99, 102, 241)',
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
          <p className="text-gray-500">Campus entry patterns and statistics</p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student category */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Student Categories</h3>
          <div className="max-w-[250px] mx-auto">
            <Doughnut
              data={categoryData}
              options={{
                responsive: true,
                plugins: { legend: { position: 'bottom' } },
              }}
            />
          </div>
          <div className="mt-4 text-center text-sm text-gray-600">
            Total: {stats.totalStudents} students
          </div>
        </div>

        {/* Weekly trend */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-4">7-Day Attendance Trend</h3>
          <Line
            data={weeklyChart}
            options={{
              responsive: true,
              scales: { y: { beginAtZero: true } },
            }}
          />
        </div>
      </div>

      {/* Hourly distribution */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-700 mb-4">
          Hourly Entry/Exit Distribution — {selectedDate}
        </h3>
        <Bar
          data={hourlyChart}
          options={{
            responsive: true,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
          }}
        />
      </div>

      {/* Campus population trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-700 mb-4">
          Campus Population Throughout the Day
        </h3>
        <Line
          data={populationChart}
          options={{
            responsive: true,
            scales: { y: { beginAtZero: true } },
          }}
        />
      </div>
    </div>
  );
}
