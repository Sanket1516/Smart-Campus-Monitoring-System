import { useCallback, useEffect, useState } from 'react';
import { getSyncOverviewApi } from '../../services/api';
import useSyncEvents from './useSyncEvents';
import { card, formatDateTime } from './syncUi';
import DeviceOverview from './DeviceOverview';
import { SyncStatusBadge } from './SyncStatusBadges';

const Stat = ({ label, value, tone = 'text-gray-900 dark:text-gray-100' }) => (
  <div>
    <div className={`text-2xl font-semibold ${tone}`}>{value ?? '—'}</div>
    <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
  </div>
);

/** Sync health summary: terminals online/offline, queue, awaiting fingerprints. */
export default function SyncHealthPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await getSyncOverviewApi();
      setData(response.data);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Sync status unavailable');
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);
  useSyncEvents(load, 1500);

  if (error) return <div className={`${card} text-sm text-red-600`}>{error}</div>;
  if (!data) return <div className={`${card} text-sm text-gray-500`}>Loading sync health…</div>;

  return (
    <div className={`${card} space-y-4`}>
      {data.simulationMode && (
        <div className="rounded-lg border border-purple-300 bg-purple-50 p-3 text-sm font-medium text-purple-800 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200">
          SIMULATION MODE is on. Data from simulated terminals is labelled SIMULATED and is never sent to real devices.
        </div>
      )}
      <DeviceOverview devices={data.devices} />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Terminal sync health</h3>
        <span className="text-xs text-gray-500">
          Last reconciliation: {data.lastReconciliation ? formatDateTime(data.lastReconciliation.startedAt) : 'never'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Terminals" value={data.terminals.total} />
        <Stat label="Online" value={data.terminals.online} tone="text-green-600" />
        <Stat label="Offline" value={data.terminals.offline} tone={data.terminals.offline ? 'text-red-600' : undefined} />
        <Stat label="Unknown dialect" value={data.terminals.unknownDialect} tone={data.terminals.unknownDialect ? 'text-amber-600' : undefined} />
        <Stat label="Pending commands" value={data.commands.pending} />
        <Stat label="Failed commands" value={data.commands.failed} tone={data.commands.failed ? 'text-red-600' : undefined} />
        <Stat label="Awaiting fingerprint" value={data.students.awaitingFingerprint} tone="text-amber-600" />
      </div>
      {data.students.bySyncStatus && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500">Students:</span>
          {Object.entries(data.students.bySyncStatus).map(([status, count]) => (
            <span key={status} className="flex items-center gap-1">
              <SyncStatusBadge status={status} /> {count}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Reconcile source: {data.config.reconcileSource} · sidecar {data.config.sidecar ? 'configured' : 'not configured'} · {data.config.maxCommandsPerPoll} command(s)/poll · Size= in {data.config.templateSizeMode}
      </p>
    </div>
  );
}
