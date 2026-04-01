import { HiOutlineChip, HiOutlinePencilAlt, HiOutlinePlus, HiOutlineServer, HiOutlineTrash } from 'react-icons/hi';

const formatRelativeTime = (value) => {
  if (!value) return 'Never';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const groupTerminals = (terminals) =>
  Object.entries(
    (terminals || []).reduce((acc, terminal) => {
      const key = terminal.isEnrollmentStation
        ? 'Enrollment Station'
        : `Gate ${terminal.gateNumber} - ${terminal.gateName}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(terminal);
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b));

export default function SettingsTerminalsTab({
  terminals,
  summary,
  form,
  setForm,
  showForm,
  setShowForm,
  editingTerminal,
  setEditingTerminal,
  saving,
  onSave,
  onDelete,
  onReset,
}) {
  const groupedTerminals = groupTerminals(terminals);

  const submit = (e) => {
    e.preventDefault();
    onSave(
      {
        ...form,
        machineNumber: Number(form.machineNumber),
      },
      editingTerminal?.machineNumber ?? null
    );
  };

  return (
    <div className="space-y-6">
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

      <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Gate & Terminal Management</h2>
          <p className="text-sm text-gray-500">Full terminal management using the existing terminal APIs.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (showForm) onReset();
            else setShowForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <HiOutlinePlus className="h-5 w-5" />
          {showForm ? 'Close Form' : 'Add Terminal'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-6 md:grid-cols-2 xl:grid-cols-3">
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100" type="number" min="1" placeholder="Machine Number" value={form.machineNumber} onChange={(e) => setForm((s) => ({ ...s, machineNumber: e.target.value }))} disabled={Boolean(editingTerminal)} required />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Device Serial Number" value={form.deviceSN} onChange={(e) => setForm((s) => ({ ...s, deviceSN: e.target.value }))} required />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Device Name" value={form.deviceName} onChange={(e) => setForm((s) => ({ ...s, deviceName: e.target.value }))} />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Gate Name" value={form.gateName} onChange={(e) => setForm((s) => ({ ...s, gateName: e.target.value }))} required />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Terminal Label" value={form.terminalLabel} onChange={(e) => setForm((s) => ({ ...s, terminalLabel: e.target.value }))} />
          <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Terminal IP" value={form.terminalIP} onChange={(e) => setForm((s) => ({ ...s, terminalIP: e.target.value }))} />
          <input className="md:col-span-2 xl:col-span-3 rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Location" value={form.location} onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))} />
          <div className="md:col-span-2 xl:col-span-3 flex gap-3">
            <button className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700" disabled={saving}>
              {saving ? 'Saving...' : editingTerminal ? 'Update Terminal' : 'Register Terminal'}
            </button>
            <button type="button" onClick={onReset} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {groupedTerminals.map(([groupName, items]) => (
        <section key={groupName} className="space-y-4">
          <div className="flex items-center gap-3">
            <HiOutlineServer className="h-5 w-5 text-primary-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{groupName}</h3>
              <p className="text-sm text-gray-500">{items.length} terminal(s)</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {items.map((terminal) => (
              <article key={terminal.machineNumber} className={`rounded-2xl border bg-white p-5 shadow-sm ${terminal.isOnline ? 'border-emerald-200' : 'border-red-200 bg-red-50/40'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-800">{terminal.terminalLabel}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${terminal.isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {terminal.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">Machine #{terminal.machineNumber} - SN {terminal.deviceSN}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTerminal(terminal);
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
                      }}
                      className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                    >
                      <HiOutlinePencilAlt className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={() => onDelete(terminal)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50">
                      <HiOutlineTrash className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-600">
                  <p><span className="font-medium text-gray-700">Device:</span> {terminal.deviceName || 'Not set'}</p>
                  <p><span className="font-medium text-gray-700">IP:</span> {terminal.terminalIP || 'Not set'}</p>
                  <p><span className="font-medium text-gray-700">Scans Today:</span> {terminal.scansToday}</p>
                  <p><span className="font-medium text-gray-700">Total Scans:</span> {terminal.totalScans}</p>
                  <p className="col-span-2"><span className="font-medium text-gray-700">Last Seen:</span> {formatRelativeTime(terminal.lastSeen)}</p>
                </div>
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <HiOutlineChip className="h-4 w-4 text-gray-400" />
                    <span>{terminal.gateName}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
