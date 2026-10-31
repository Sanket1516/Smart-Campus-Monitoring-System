import { useState, useEffect } from 'react';
import { getHostellerStatusApi } from '../services/api';
import {
  HiOutlineUserGroup,
  HiOutlineExclamationCircle,
  HiOutlineRefresh,
} from 'react-icons/hi';

export default function Hostellers() {
  const [hostellers, setHostellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | outside | late | no_activity

  const load = async () => {
    setLoading(true);
    try {
      const res = await getHostellerStatusApi();
      setHostellers(res.data);
    } catch (err) {
      console.error('Hosteller status error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = hostellers.filter((h) => {
    if (filter === 'outside') return h.status === 'exited';
    if (filter === 'late') return h.lateReturn;
    if (filter === 'no_activity') return h.status === 'no_activity';
    return true;
  });

  const outsideCount = hostellers.filter((h) => h.status === 'exited').length;
  const lateCount = hostellers.filter((h) => h.lateReturn).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Hosteller Monitoring</h1>
          <p className="text-gray-500">Track hosteller entry/exit and curfew compliance</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-lg font-medium hover:bg-primary-100"
        >
          <HiOutlineRefresh className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-xl">
              <HiOutlineUserGroup className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Hostellers</p>
              <p className="text-2xl font-bold text-gray-800">{hostellers.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 rounded-xl">
              <HiOutlineUserGroup className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Currently Outside</p>
              <p className="text-2xl font-bold text-yellow-700">{outsideCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 rounded-xl">
              <HiOutlineExclamationCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Late Returns</p>
              <p className="text-2xl font-bold text-red-700">{lateCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'all', label: 'All' },
          { key: 'outside', label: 'Outside' },
          { key: 'late', label: 'Late Return' },
          { key: 'no_activity', label: 'No Activity' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-white shadow text-primary-700' : 'text-gray-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">SAP ID</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Department</th>
                  <th className="text-left px-4 py-3 font-medium">Year</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Last Scan</th>
                  <th className="text-left px-4 py-3 font-medium">Alert</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">
                      No hostellers match filter
                    </td>
                  </tr>
                ) : (
                  filtered.map((h) => (
                    <tr key={h.sapId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{h.sapId}</td>
                      <td className="px-4 py-3 font-medium">{h.name}</td>
                      <td className="px-4 py-3">{h.department}</td>
                      <td className="px-4 py-3">{h.year}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            h.status === 'entered'
                              ? 'bg-green-100 text-green-700'
                              : h.status === 'exited'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {h.status === 'entered'
                            ? 'Inside Campus'
                            : h.status === 'exited'
                            ? 'Outside'
                            : 'No Activity'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {h.lastScan
                          ? new Date(h.lastScan).toLocaleTimeString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {h.lateReturn && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                            LATE RETURN
                          </span>
                        )}
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
