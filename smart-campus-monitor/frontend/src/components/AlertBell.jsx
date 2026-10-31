import { useState } from 'react';
import { HiOutlineBell } from 'react-icons/hi';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

const formatTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Just now';

export default function AlertBell() {
  const { admin } = useAuth();
  const { alerts, unreadAlerts, refreshAlerts, markAlertsRead } = useSocket();
  const [open, setOpen] = useState(false);

  const handleToggle = async () => {
    const nextOpen = !open;
    setOpen(nextOpen);

    if (!nextOpen) {
      return;
    }

    const latest = await refreshAlerts();
    const unreadIds = (latest.alerts || [])
      .filter((alert) => !(alert.readBy || []).includes(admin?.id))
      .map((alert) => alert._id);

    if (unreadIds.length) {
      await markAlertsRead(unreadIds);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative inline-flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-2 text-gray-700 transition-colors hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        title="Alerts"
      >
        <HiOutlineBell className="h-5 w-5" />
        {unreadAlerts > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
            {unreadAlerts > 9 ? '9+' : unreadAlerts}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">Alerts</h3>
              <span className="text-xs text-gray-500 dark:text-slate-400">{unreadAlerts} unread</span>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                No alerts yet.
              </div>
            ) : (
              alerts.slice(0, 10).map((alert) => (
                <div
                  key={alert._id}
                  className="border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-slate-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-slate-100">
                        {alert.message}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
                        {alert.type?.replace(/_/g, ' ') || 'alert'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                    {formatTime(alert.timestamp)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
