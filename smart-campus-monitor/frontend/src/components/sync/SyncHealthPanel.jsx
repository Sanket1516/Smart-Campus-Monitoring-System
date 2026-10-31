import { useCallback, useEffect, useState } from 'react';
import { getSyncOverviewApi } from '../../services/api';
import useSyncEvents from './useSyncEvents';
import { card, formatDateTime } from './syncUi';

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
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
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
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Reconcile source: {data.config.reconcileSource} · sidecar {data.config.sidecar ? 'configured' : 'not configured'} · {data.config.maxCommandsPerPoll} command(s)/poll · Size= in {data.config.templateSizeMode}
      </p>
    </div>
  );
}
