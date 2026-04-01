export default function SettingsSystemTab({ settings, setSettings, saving, onSave }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800">System Configuration</h2>
        <p className="text-sm text-gray-500">Branding and runtime configuration stored in SystemConfig.</p>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">College Name</label>
            <input type="text" value={settings.collegeName || ''} onChange={(e) => setSettings((current) => ({ ...current, collegeName: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">College Logo URL</label>
            <input type="text" value={settings.collegeLogo || ''} onChange={(e) => setSettings((current) => ({ ...current, collegeLogo: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Cloudflare Tunnel URL</label>
            <input type="text" value={settings.cloudflareUrl || ''} onChange={(e) => setSettings((current) => ({ ...current, cloudflareUrl: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Timezone</label>
            <input type="text" value={settings.timezone || 'Asia/Kolkata'} onChange={(e) => setSettings((current) => ({ ...current, timezone: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Data Retention (Months)</label>
            <input type="number" min="1" value={settings.dataRetentionMonths ?? 12} onChange={(e) => setSettings((current) => ({ ...current, dataRetentionMonths: Number(e.target.value) }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
            <span className="font-medium text-gray-700">Maintenance Mode</span>
            <input type="checkbox" checked={Boolean(settings.maintenanceMode)} onChange={(e) => setSettings((current) => ({ ...current, maintenanceMode: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
          </label>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-600">Maintenance Message</label>
            <textarea rows={4} value={settings.maintenanceMessage || ''} onChange={(e) => setSettings((current) => ({ ...current, maintenanceMessage: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-6">
          <button type="button" onClick={onSave} className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700" disabled={saving}>
            Save System Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
