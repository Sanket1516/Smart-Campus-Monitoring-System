import { useState, useEffect } from 'react';
import { getLogsApi, getUnauthorizedLogsApi } from '../services/api';
import { HiOutlineSearch, HiOutlineFilter, HiOutlineExclamationCircle } from 'react-icons/hi';

export default function StudentLogs() {
  const [logs, setLogs] = useState([]);
  const [unauthorizedLogs, setUnauthorizedLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('entry'); // entry | unauthorized
  const [filters, setFilters] = useState({
    date: new Date().toISOString().split('T')[0],
    sapId: '',
    category: '',
    status: '',
    page: 1,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (tab === 'entry') {
          const params = {};
          if (filters.date) params.date = filters.date;
          if (filters.sapId) params.sapId = filters.sapId;
          if (filters.category) params.category = filters.category;
          if (filters.status) params.status = filters.status;
          params.page = filters.page;
          const res = await getLogsApi(params);
          setLogs(res.data.logs);
          setTotal(res.data.total);
        } else {
          const res = await getUnauthorizedLogsApi({ date: filters.date });
          setUnauthorizedLogs(res.data.logs);
        }
      } catch (err) {
        console.error('Logs load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [filters, tab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Entry Logs</h1>
          <p className="text-gray-500">View student entry and exit records</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab('entry')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'entry' ? 'bg-white shadow text-primary-700' : 'text-gray-600'
            }`}
          >
            Entry Logs
          </button>
          <button
            onClick={() => setTab('unauthorized')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
              tab === 'unauthorized' ? 'bg-white shadow text-red-700' : 'text-gray-600'
            }`}
          >
            <HiOutlineExclamationCircle className="w-4 h-4" />
            Unauthorized
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3 text-gray-600">
          <HiOutlineFilter className="w-5 h-5" />
          <span className="font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            type="date"
            value={filters.date}
            onChange={(e) => setFilters({ ...filters, date: e.target.value, page: 1 })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          {tab === 'entry' && (
            <>
              <div className="relative">
                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search SAP ID"
                  value={filters.sapId}
                  onChange={(e) => setFilters({ ...filters, sapId: e.target.value, page: 1 })}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value, page: 1 })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">All Categories</option>
                <option value="day_scholar">Day Scholar</option>
                <option value="hosteller">Hosteller</option>
              </select>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">All Status</option>
                <option value="entered">Entered</option>
                <option value="exited">Exited</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : tab === 'entry' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">SAP ID</th>
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Category</th>
                    <th className="text-left px-4 py-3 font-medium">Entry Time</th>
                    <th className="text-left px-4 py-3 font-medium">Exit Time</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-400">
                        No logs found
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono">{log.sapId}</td>
                        <td className="px-4 py-3">{log.studentName}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              log.category === 'hosteller'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {log.category === 'hosteller' ? 'Hosteller' : 'Day Scholar'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {log.entryTime
                            ? new Date(log.entryTime).toLocaleTimeString()
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {log.exitTime
                            ? new Date(log.exitTime).toLocaleTimeString()
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              log.status === 'entered'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {log.status === 'entered' ? 'Inside' : 'Exited'}
                          </span>
                          {log.lateReturn && (
                            <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                              Late
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {total > 50 && (
              <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center text-sm">
                <span className="text-gray-500">Showing {logs.length} of {total}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                    disabled={filters.page <= 1}
                    className="px-3 py-1 border rounded disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                    disabled={logs.length < 50}
                    className="px-3 py-1 border rounded disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-50 text-red-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Scanned Value</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Time</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {unauthorizedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400">
                      No unauthorized scans
                    </td>
                  </tr>
                ) : (
                  unauthorizedLogs.map((log) => (
                    <tr key={log._id} className="hover:bg-red-50/50">
                      <td className="px-4 py-3 font-mono font-bold text-red-700">
                        {log.scannedValue}
                      </td>
                      <td className="px-4 py-3">{log.date}</td>
                      <td className="px-4 py-3">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            log.resolved
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {log.resolved ? 'Resolved' : 'Unresolved'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
