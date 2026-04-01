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

const getLocalDateInputValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, Filler
);

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getLocalDateInputValue());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [dashRes, hourlyRes] = await Promise.all([
          getDashboardApi(selectedDate),
          getHourlyApi(selectedDate),
        ]);
        
        if (!dashRes.data) {
          throw new Error('No dashboard data received from server');
        }
        
        setStats(dashRes.data);
        setHourly(hourlyRes.data);
      } catch (err) {
        console.error('Analytics load error:', err);
        
        // Determine error type and message
        let errorMessage = 'Failed to load analytics data';
        let errorDetails = '';
        
        if (err.response) {
          // Server responded with error
          const status = err.response.status;
          if (status === 401) {
            errorMessage = 'Authentication required';
            errorDetails = 'Please log out and log back in to refresh your session.';
          } else if (status === 403) {
            errorMessage = 'Access denied';
            errorDetails = 'You do not have permission to view analytics.';
          } else if (status === 500) {
            errorMessage = 'Server error';
            errorDetails = 'The server encountered an error processing your request.';
          } else {
            errorMessage = `Error ${status}`;
            errorDetails = err.response.data?.message || 'An unexpected error occurred.';
          }
        } else if (err.request) {
          // Request made but no response
          errorMessage = 'Network error';
          errorDetails = 'Cannot connect to the server. Please check your internet connection.';
        } else {
          // Other errors
          errorMessage = 'Error loading data';
          errorDetails = err.message || 'An unexpected error occurred.';
        }
        
        setError({ message: errorMessage, details: errorDetails });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 dark:bg-red-900/20 dark:border-red-800">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
                {error.message}
              </h3>
              <p className="text-red-700 dark:text-red-400 mb-4">
                {error.details}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors dark:bg-red-700 dark:hover:bg-red-600"
                >
                  Retry
                </button>
                <button
                  onClick={() => setSelectedDate(getLocalDateInputValue())}
                  className="px-4 py-2 bg-white text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors dark:bg-slate-800 dark:text-red-400 dark:border-red-700 dark:hover:bg-slate-700"
                >
                  Reset Date
                </button>
              </div>
              <details className="mt-4">
                <summary className="text-sm text-red-600 dark:text-red-400 cursor-pointer hover:underline">
                  Technical details
                </summary>
                <pre className="mt-2 text-xs bg-red-100 dark:bg-red-950 p-3 rounded overflow-auto text-red-900 dark:text-red-300">
                  Date: {selectedDate}{'\n'}
                  Timestamp: {new Date().toISOString()}{'\n'}
                  Error: {error.message}{'\n'}
                  Details: {error.details}
                </pre>
              </details>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 dark:bg-yellow-900/20 dark:border-yellow-800">
          <p className="text-yellow-800 dark:text-yellow-300">No analytics data available for the selected date.</p>
        </div>
      </div>
    );
  }

  const dayScholarCount = Number(stats.totalDayScholars) || 0;
  const hostellerCount = Number(stats.totalHostellers) || 0;
  const totalStudents = Number(stats.totalStudents) || 0;

  // Category breakdown doughnut
  const categoryData = {
    labels: ['Day Scholars', 'Hostellers'],
    datasets: [
      {
        data: [dayScholarCount, hostellerCount],
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
                plugins: {
                  legend: { position: 'bottom' },
                  tooltip: {
                    callbacks: {
                      label(context) {
                        const label = context.label || '';
                        const value = Number(context.raw) || 0;
                        const percent = totalStudents > 0
                          ? Math.round((value / totalStudents) * 100)
                          : 0;
                        return `${label}: ${value} students (${percent}%)`;
                      },
                    },
                  },
                },
              }}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
              Day Scholars: <span className="font-semibold">{dayScholarCount}</span>
            </div>
            <div className="rounded-lg bg-violet-50 px-3 py-2 text-violet-700">
              Hostellers: <span className="font-semibold">{hostellerCount}</span>
            </div>
          </div>
          <div className="mt-4 text-center text-sm text-gray-600">
            Total: {totalStudents} students
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
