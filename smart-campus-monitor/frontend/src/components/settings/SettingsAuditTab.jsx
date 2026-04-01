import { useState } from 'react';
import { HiOutlineDocumentDownload } from 'react-icons/hi';

const fmt = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'N/A';

export default function SettingsAuditTab({ logs, admins, onApplyFilters, onExportCsv }) {
  const [filters, setFilters] = useState({
    adminId: '',
    action: '',
    dateFrom: '',
    dateTo: '',
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Audit Log</h2>
            <p className="text-sm text-gray-500">Filter, review, and export audit records. Delete is intentionally unavailable.</p>
          </div>
          <button type="button" onClick={() => onExportCsv(filters)} className="inline-flex items-center gap-2 rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100">
            <HiOutlineDocumentDownload className="h-5 w-5" />
            Export CSV
          </button>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          <select value={filters.adminId} onChange={(e) => setFilters((current) => ({ ...current, adminId: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All Admins</option>
            {admins.map((admin) => (
              <option key={admin._id} value={admin._id}>
                {admin.name || admin.username}
              </option>
            ))}
          </select>
          <input value={filters.action} onChange={(e) => setFilters((current) => ({ ...current, action: e.target.value }))} placeholder="Action contains..." className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((current) => ({ ...current, dateFrom: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters((current) => ({ ...current, dateTo: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div className="mt-4 flex gap-3">
          <button type="button" onClick={() => onApplyFilters(filters)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">Apply Filters</button>
          <button type="button" onClick={() => { const reset = { adminId: '', action: '', dateFrom: '', dateTo: '' }; setFilters(reset); onApplyFilters(reset); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Reset</button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Timestamp</th>
                <th className="px-4 py-3 text-left font-medium">Admin</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
                <th className="px-4 py-3 text-left font-medium">Entity</th>
                <th className="px-4 py-3 text-left font-medium">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log._id}>
                  <td className="px-4 py-3">{fmt(log.timestamp)}</td>
                  <td className="px-4 py-3">{log.admin?.name || log.admin?.username || 'System'}</td>
                  <td className="px-4 py-3">{log.action}</td>
                  <td className="px-4 py-3">{log.entity}</td>
                  <td className="px-4 py-3">{log.ipAddress || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
            No audit records match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
