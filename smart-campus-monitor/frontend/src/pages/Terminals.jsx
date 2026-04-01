import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineChip,
  HiOutlineClock,
  HiOutlineCollection,
  HiOutlineDesktopComputer,
  HiOutlineOfficeBuilding,
  HiOutlinePencilAlt,
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlineServer,
  HiOutlineTrash,
} from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';
import {
  createTerminalApi,
  deleteTerminalApi,
  getTerminalLogsApi,
  getTerminalStatusApi,
  getTerminalsApi,
  updateTerminalApi,
} from '../services/api';

const createInitialForm = () => ({
  machineNumber: '',
  deviceSN: '',
  deviceName: '',
  gateName: '',
  terminalLabel: '',
  location: '',
  terminalIP: '',
});

const formatDateTime = (value) => {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatRelativeTime = (value) => {
  if (!value) return 'Never';

  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const formatLastScan = (event) => {
  if (!event) return 'No scan history yet';

  const time = new Date(event.timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (event.type === 'unauthorized') {
    return `Unauthorized scan at ${time}`;
  }

  const action = event.status === 'entered' ? 'ENTRY' : 'EXIT';
  return `${event.studentName || event.sapId} - ${action} - ${time}`;
};

const groupTerminals = (terminals) => {
  const groups = terminals.reduce((acc, terminal) => {
    const key = terminal.isEnrollmentStation
      ? 'Enrollment Station'
      : `Gate ${terminal.gateNumber} - ${terminal.gateName}`;

    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(terminal);
    return acc;
  }, {});

  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
};

export default function Terminals() {
  const { admin } = useAuth();
  const isAdmin = admin?.role === 'admin';
  const [terminals, setTerminals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingMachineNumber, setEditingMachineNumber] = useState(null);
  const [form, setForm] = useState(createInitialForm());
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const groupedTerminals = useMemo(() => groupTerminals(terminals), [terminals]);

  const loadTerminals = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [terminalsRes, statusRes] = await Promise.all([
        getTerminalsApi(),
        getTerminalStatusApi(),
      ]);

      setTerminals(terminalsRes.data.terminals || []);
      setSummary(statusRes.data.summary || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load terminal data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTerminals();
  }, []);

  const updateForm = (updates) => {
    setForm((current) => ({ ...current, ...updates }));
  };

  const resetForm = () => {
    setForm(createInitialForm());
    setEditingMachineNumber(null);
    setShowForm(false);
  };

  const handleEdit = (terminal) => {
    setEditingMachineNumber(terminal.machineNumber);
    setForm({
      machineNumber: String(terminal.machineNumber),
      deviceSN: terminal.deviceSN || '',
      deviceName: terminal.deviceName || '',
      gateName: terminal.gateName || '',
      terminalLabel: terminal.terminalLabel || '',
      location: terminal.location || '',
      terminalIP: terminal.terminalIP || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (terminal) => {
    if (!window.confirm(`Delete ${terminal.terminalLabel}?`)) {
      return;
    }

    try {
      await deleteTerminalApi(terminal.machineNumber);
      toast.success('Terminal deleted successfully');
      if (selectedTerminal?.machineNumber === terminal.machineNumber) {
        setSelectedTerminal(null);
        setTerminalLogs([]);
      }
      loadTerminals({ silent: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete terminal');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      ...form,
      machineNumber: Number(form.machineNumber),
    };

    try {
      if (editingMachineNumber !== null) {
        await updateTerminalApi(editingMachineNumber, payload);
        toast.success('Terminal updated successfully');
      } else {
        await createTerminalApi(payload);
        toast.success('Terminal registered successfully');
      }

      resetForm();
      loadTerminals({ silent: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save terminal');
    } finally {
      setSaving(false);
    }
  };

  const handleViewLogs = async (terminal) => {
    setSelectedTerminal(terminal);
    setLogsLoading(true);

    try {
      const res = await getTerminalLogsApi(terminal.machineNumber, { limit: 10 });
      setTerminalLogs(res.data.logs || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load terminal logs');
      setTerminalLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-800">
            <HiOutlineDesktopComputer className="h-7 w-7" />
            Terminal Management
          </h1>
          <p className="text-sm text-gray-500">
            Monitor every gate terminal, enrollment station, and last-seen status from one place.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => loadTerminals({ silent: true })}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <HiOutlineRefresh className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setShowForm((current) => !current);
                if (showForm) resetForm();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <HiOutlinePlus className="h-5 w-5" />
              {showForm ? 'Close Form' : 'Add Terminal'}
            </button>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Total Terminals</p>
            <p className="mt-2 text-2xl font-bold text-gray-800">{summary.total}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Online</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{summary.online}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs uppercase tracking-wide text-red-700">Offline</p>
            <p className="mt-2 text-2xl font-bold text-red-700">{summary.offline}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs uppercase tracking-wide text-blue-700">Gate Terminals</p>
            <p className="mt-2 text-2xl font-bold text-blue-700">{summary.gateTerminals}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs uppercase tracking-wide text-amber-700">Enrollment Stations</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{summary.enrollmentStations}</p>
          </div>
        </div>
      )}

      {showForm && isAdmin && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <HiOutlineChip className="h-6 w-6 text-primary-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                {editingMachineNumber !== null ? 'Edit Terminal' : 'Register New Terminal'}
              </h2>
              <p className="text-sm text-gray-500">
                Use machine number `50` for the enrollment station. Gate terminals follow `101-104`, `201-204`, `301-304`.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Machine Number</label>
              <input
                type="number"
                min="1"
                value={form.machineNumber}
                onChange={(e) => updateForm({ machineNumber: e.target.value })}
                disabled={editingMachineNumber !== null}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Device Serial Number</label>
              <input
                type="text"
                value={form.deviceSN}
                onChange={(e) => updateForm({ deviceSN: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Device Name</label>
              <input
                type="text"
                value={form.deviceName}
                onChange={(e) => updateForm({ deviceName: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Gate Name</label>
              <input
                type="text"
                value={form.gateName}
                onChange={(e) => updateForm({ gateName: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Terminal Label</label>
              <input
                type="text"
                value={form.terminalLabel}
                onChange={(e) => updateForm({ terminalLabel: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Auto-generated if left blank"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Terminal IP</label>
              <input
                type="text"
                value={form.terminalIP}
                onChange={(e) => updateForm({ terminalIP: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="192.168.1.25"
              />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <label className="mb-1 block text-sm font-medium text-gray-600">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => updateForm({ location: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Main gate security room"
              />
            </div>
            <div className="md:col-span-2 xl:col-span-3 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingMachineNumber !== null ? 'Update Terminal' : 'Register Terminal'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {groupedTerminals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <HiOutlineServer className="mx-auto h-12 w-12 text-gray-300" />
          <h2 className="mt-4 text-lg font-semibold text-gray-700">No terminals registered yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            Add your gate terminals and enrollment station to start monitoring terminal health.
          </p>
        </div>
      ) : (
        groupedTerminals.map(([groupName, items]) => (
          <section key={groupName} className="space-y-4">
            <div className="flex items-center gap-3">
              <HiOutlineCollection className="h-5 w-5 text-primary-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{groupName}</h2>
                <p className="text-sm text-gray-500">{items.length} terminal(s)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {items.map((terminal) => (
                <article
                  key={terminal.machineNumber}
                  className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                    terminal.isOnline
                      ? 'border-emerald-200'
                      : 'border-red-200 bg-red-50/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-800">{terminal.terminalLabel}</h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            terminal.isOnline
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {terminal.isOnline ? 'Online' : 'Offline'}
                        </span>
                        {terminal.isEnrollmentStation && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            Enrollment
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        Machine #{terminal.machineNumber} • SN {terminal.deviceSN}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleViewLogs(terminal)}
                        className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                        title="View recent logs"
                      >
                        <HiOutlineClock className="h-5 w-5" />
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEdit(terminal)}
                            className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                            title="Edit terminal"
                          >
                            <HiOutlinePencilAlt className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(terminal)}
                            className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                            title="Delete terminal"
                          >
                            <HiOutlineTrash className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Scans Today</p>
                      <p className="mt-1 text-xl font-semibold text-gray-800">{terminal.scansToday}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Total Scans</p>
                      <p className="mt-1 text-xl font-semibold text-gray-800">{terminal.totalScans}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2 text-sm text-gray-600">
                    <div className="flex items-start gap-2">
                      <HiOutlineOfficeBuilding className="mt-0.5 h-4 w-4 text-gray-400" />
                      <span>{terminal.gateName}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <HiOutlineChip className="mt-0.5 h-4 w-4 text-gray-400" />
                      <span>{terminal.deviceName || 'Device name not set'}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <HiOutlineServer className="mt-0.5 h-4 w-4 text-gray-400" />
                      <span>{terminal.terminalIP || 'IP not configured'}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <HiOutlineClock className="mt-0.5 h-4 w-4 text-gray-400" />
                      <span>
                        Last seen {formatRelativeTime(terminal.lastSeen)}
                        {' • '}
                        {formatDateTime(terminal.lastSeen)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Last Scan Event</p>
                    <p className="mt-2 text-sm text-gray-700">{formatLastScan(terminal.lastScanEvent)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}

      {selectedTerminal && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                Recent Logs • {selectedTerminal.terminalLabel}
              </h2>
              <p className="text-sm text-gray-500">
                Machine #{selectedTerminal.machineNumber} • {selectedTerminal.gateName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedTerminal(null);
                setTerminalLogs([]);
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
            </div>
          ) : terminalLogs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
              No terminal-specific logs yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Time</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Details</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {terminalLogs.map((log) => (
                    <tr key={log._id}>
                      <td className="px-4 py-3 text-gray-600">{formatDateTime(log.timestamp)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            log.type === 'authorized'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {log.type === 'authorized' ? 'Authorized' : 'Unauthorized'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {log.type === 'authorized'
                          ? `${log.studentName} (${log.sapId})`
                          : log.scannedValue}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {log.type === 'authorized'
                          ? log.status === 'entered'
                            ? 'Entry'
                            : 'Exit'
                          : log.resolved
                          ? 'Resolved'
                          : 'Open'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
