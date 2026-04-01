export default function SettingsNotificationsTab({
  hostels,
  settings,
  setSettings,
  testEmailRecipient,
  setTestEmailRecipient,
  saving,
  onSave,
  onSendTestEmail,
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800">Notification Settings</h2>
        <p className="text-sm text-gray-500">All toggles and thresholds are stored in SystemConfig.</p>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            ['emailOnEntry', 'Email On Entry'],
            ['emailOnExit', 'Email On Exit'],
            ['emailOnUnauthorized', 'Email On Unauthorized'],
            ['emailOnLateReturn', 'Email On Late Return'],
          ].map(([field, label]) => (
            <label key={field} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <span className="font-medium text-gray-700">{label}</span>
              <input
                type="checkbox"
                checked={Boolean(settings[field])}
                onChange={(e) => setSettings((current) => ({ ...current, [field]: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
              />
            </label>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Default Curfew Time</label>
            <input type="time" value={settings.defaultCurfewTime || '22:00'} onChange={(e) => setSettings((current) => ({ ...current, defaultCurfewTime: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Grace Period (Minutes)</label>
            <input type="number" min="0" value={settings.gracePeriodMinutes ?? 30} onChange={(e) => setSettings((current) => ({ ...current, gracePeriodMinutes: Number(e.target.value) }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Email Sender Name</label>
            <input type="text" value={settings.emailSenderName || ''} onChange={(e) => setSettings((current) => ({ ...current, emailSenderName: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Curfew Time Per Hostel</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {hostels.map((hostel) => (
              <label key={hostel._id} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm">
                <span className="font-medium text-gray-700">{hostel.name}</span>
                <input
                  type="time"
                  value={settings.curfewByHostel?.[hostel._id] || settings.defaultCurfewTime || '22:00'}
                  onChange={(e) =>
                    setSettings((current) => ({
                      ...current,
                      curfewByHostel: {
                        ...(current.curfewByHostel || {}),
                        [hostel._id]: e.target.value,
                      },
                    }))
                  }
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
        </div>
        <div className="mt-6">
          <button type="button" onClick={onSave} className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700" disabled={saving}>
            Save Notification Settings
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800">Send Test Email</h3>
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input type="email" value={testEmailRecipient} onChange={(e) => setTestEmailRecipient(e.target.value)} placeholder="Recipient email" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <button type="button" onClick={onSendTestEmail} className="rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100">
            Send Test Email
          </button>
        </div>
      </div>
    </div>
  );
}
