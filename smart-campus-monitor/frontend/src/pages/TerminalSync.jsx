import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineRefresh, HiOutlineStatusOnline } from 'react-icons/hi';
import {
  backupTerminalApi,
  cancelSyncCommandApi,
  getBiometricAuditApi,
  getReconciliationReportsApi,
  getSyncCommandsApi,
  getSyncJobsApi,
  getSyncTerminalsApi,
  probeTerminalApi,
  resyncTerminalApi,
  retrySyncCommandsApi,
  runReconciliationApi,
  updateSyncTerminalApi,
} from '../services/api';
import SyncHealthPanel from '../components/sync/SyncHealthPanel';
import useSyncEvents from '../components/sync/useSyncEvents';
import { Pill, btnPrimary, btnSecondary, card, errorMessage, formatDateTime, input, td, th } from '../components/sync/syncUi';

const TABS = [
  ['terminals', 'Terminals'],
  ['commands', 'Command queue'],
  ['reconciliation', 'Reconciliation'],
  ['audit', 'Biometric audit log'],
  ['jobs', 'Bulk jobs'],
];

const Table = ({ head, children }) => (
  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead className="bg-gray-50 dark:bg-gray-800">
        <tr>
          {head.map((h) => (
            <th key={h} className={th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">{children}</tbody>
    </table>
  </div>
);

function TerminalsTab() {
  const [terminals, setTerminals] = useState([]);
  const [editing, setEditing] = useState(null);
  const [groupsText, setGroupsText] = useState('');

  const load = useCallback(async () => {
    try {
      setTerminals((await getSyncTerminalsApi()).data.terminals);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useSyncEvents(load);

  const act = async (fn, message) => {
    try {
      const response = await fn();
      toast.success(typeof message === 'function' ? message(response.data) : message);
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const saveGroups = (sn) =>
    act(
      () => updateSyncTerminalApi(sn, { groups: groupsText.split(',').map((g) => g.trim()).filter(Boolean) }),
      'Groups saved'
    ).then(() => setEditing(null));

  return (
    <Table head={['Terminal', 'Status', 'Dialect / push', 'Firmware / algorithm', 'Groups', 'Last seen / sync', 'Queue', 'Actions']}>
      {terminals.map((t) => (
        <tr key={t.serialNumber} className={t.enabled ? '' : 'opacity-60'}>
          <td className={td}>
            <div className="font-medium">{t.terminalLabel}</div>
            <div className="text-xs text-gray-500">
              {t.serialNumber} · {t.ip || 'no IP'} · {t.role}
            </div>
          </td>
          <td className={td}>
            <Pill value={t.online ? 'online' : 'offline'} />
            {!t.enabled && <div className="text-xs text-gray-500">disabled</div>}
          </td>
          <td className={td}>
            <Pill value={t.dialect === 'unknown' ? 'pending' : 'ok'} label={t.dialect} />
            <div className="text-xs text-gray-500">
              {t.dialectSource || '—'} · push {t.pushVersion || '?'}
            </div>
          </td>
          <td className={`${td} text-xs`}>
            {t.firmware || '—'}
            <div className="text-gray-500">alg {t.algorithmVersion || '?'}</div>
          </td>
          <td className={td}>
            {editing === t.serialNumber ? (
              <div className="flex gap-1">
                <input className={input} value={groupsText} onChange={(e) => setGroupsText(e.target.value)} />
                <button className={btnPrimary} onClick={() => saveGroups(t.serialNumber)}>
                  Save
                </button>
              </div>
            ) : (
              <button
                className="text-left text-xs text-primary-600 hover:underline"
                onClick={() => {
                  setEditing(t.serialNumber);
                  setGroupsText(t.effectiveGroups.join(', '));
                }}
              >
                {t.effectiveGroups.join(', ') || '—'}
                {!t.groups.length && ' (default)'}
              </button>
            )}
          </td>
          <td className={`${td} text-xs`}>
            {formatDateTime(t.lastSeenAt)}
            <div className="text-gray-500">sync {formatDateTime(t.lastSyncAt)}</div>
          </td>
          <td className={td}>
            <Pill value={t.pending ? 'pending' : 'absent'} label={`${t.pending} pending`} />{' '}
            {t.failed > 0 && <Pill value="failed" label={`${t.failed} failed`} />}
          </td>
          <td className={td}>
            <div className="flex flex-wrap gap-1">
              <button className={btnSecondary} onClick={() => act(() => resyncTerminalApi(t.serialNumber), (d) => `Resync queued (${d.mode}, ${d.students ?? 0} students)`)}>
                <HiOutlineRefresh className="h-4 w-4" /> Resync
              </button>
              <button className={btnSecondary} onClick={() => act(() => probeTerminalApi(t.serialNumber), 'Dialect probe queued')}>
                Probe
              </button>
              {t.failed > 0 && (
                <button className={btnSecondary} onClick={() => act(() => retrySyncCommandsApi({ terminalSN: t.serialNumber }), (d) => `Retried ${d.retried}`)}>
                  Retry failed
                </button>
              )}
              <button className={btnSecondary} onClick={() => act(() => backupTerminalApi(t.serialNumber), (d) => `Backup: ${d.users} users, ${d.templates} templates`)}>
                Backup
              </button>
              <button
                className={btnSecondary}
                onClick={() => act(() => updateSyncTerminalApi(t.serialNumber, { enabled: !t.enabled }), t.enabled ? 'Terminal disabled' : 'Terminal enabled')}
              >
                {t.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </td>
        </tr>
      ))}
    </Table>
  );
}

function CommandsTab() {
  const [filters, setFilters] = useState({ status: 'failed', terminalSN: '' });
  const [data, setData] = useState({ commands: [], total: 0 });

  const load = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      setData((await getSyncCommandsApi({ ...params, limit: 100 })).data);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [filters]);
  useEffect(() => {
    load();
  }, [load]);
  useSyncEvents(load);

  const retryShown = async () => {
    try {
      const ids = data.commands.filter((c) => c.status === 'failed').map((c) => c._id);
      const response = await retrySyncCommandsApi({ ids });
      toast.success(`Retried ${response.data.retried}, skipped ${response.data.skipped}`);
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className={`${input} w-40`} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          {['', 'pending', 'sent', 'acked', 'failed', 'cancelled'].map((s) => (
            <option key={s} value={s}>
              {s || 'all statuses'}
            </option>
          ))}
        </select>
        <input className={`${input} w-48`} placeholder="Terminal SN" value={filters.terminalSN} onChange={(e) => setFilters((f) => ({ ...f, terminalSN: e.target.value.trim() }))} />
        <button className={btnPrimary} onClick={retryShown} disabled={!data.commands.some((c) => c.status === 'failed')}>
          Retry failed shown
        </button>
        <span className="self-center text-xs text-gray-500">{data.total} command(s)</span>
      </div>
      <Table head={['Terminal', '#', 'Type', 'Student / PIN', 'Status', 'Attempts', 'Return', 'Command', 'Updated', '']}>
        {data.commands.map((c) => (
          <tr key={c._id}>
            <td className={td}>{c.terminalSN}</td>
            <td className={td}>{c.cmdId}</td>
            <td className={td}>{c.type}</td>
            <td className={td}>
              {c.student ? `${c.student.name} (${c.student.sapId})` : '—'} · {c.pin || '—'}
            </td>
            <td className={td}>
              <Pill value={c.status} />
            </td>
            <td className={td}>{c.attempts}</td>
            <td className={`${td} text-xs`}>
              {c.returnCode ?? '—'}
              {c.lastError && <div className="max-w-xs whitespace-normal text-red-600">{c.lastError}</div>}
            </td>
            <td className={`${td} max-w-xs truncate font-mono text-xs`} title={c.text}>
              {c.text.replace(/\t/g, ' ⇥ ')}
            </td>
            <td className={`${td} text-xs`}>{formatDateTime(c.updatedAt)}</td>
            <td className={td}>
              {['pending', 'failed'].includes(c.status) && (
                <button
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => cancelSyncCommandApi(c._id).then(load).catch((e) => toast.error(errorMessage(e)))}
                >
                  Cancel
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function ReconciliationTab() {
  const [reports, setReports] = useState([]);
  const [running, setRunning] = useState(false);
  const load = useCallback(async () => {
    try {
      setReports((await getReconciliationReportsApi({ limit: 200 })).data.reports);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data } = await runReconciliationApi();
      toast.success(`Reconciled ${data.terminals} terminal(s): ${data.drift} with drift, ${data.errors} error(s), ${data.queued} fix(es) queued`);
      load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <button className={btnPrimary} onClick={runNow} disabled={running}>
        {running ? 'Running…' : 'Run reconciliation now'}
      </button>
      <Table head={['Run', 'Terminal', 'Source', 'Status', 'Desired / actual', 'Missing', 'Extra', 'Blocked present', 'Unknown PINs', 'Queued', 'Started']}>
        {reports.map((r) => (
          <tr key={r._id}>
            <td className={`${td} text-xs`}>{r.runId}</td>
            <td className={td}>{r.terminalSN}</td>
            <td className={td}>{r.source}</td>
            <td className={td}>
              <Pill value={r.status} />
              {r.error && <div className="text-xs text-red-600">{r.error}</div>}
            </td>
            <td className={td}>
              {r.desiredCount} / {r.actualCount ?? '—'}
            </td>
            <td className={td}>{r.missing.length}</td>
            <td className={td}>{r.extra.length}</td>
            <td className={td}>{r.blockedPresent.length ? <Pill value="failed" label={`${r.blockedPresent.length} ⚠`} /> : 0}</td>
            <td className={td} title={r.unknownPins.join(', ')}>
              {r.unknownPins.length}
            </td>
            <td className={td}>{r.queued}</td>
            <td className={`${td} text-xs`}>{formatDateTime(r.startedAt)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function AuditTab() {
  const [logs, setLogs] = useState([]);
  const [action, setAction] = useState('');
  useEffect(() => {
    getBiometricAuditApi({ action: action || undefined, limit: 100 })
      .then((r) => setLogs(r.data.logs))
      .catch((error) => toast.error(errorMessage(error)));
  }, [action]);
  return (
    <div className="space-y-3">
      <select className={`${input} w-56`} value={action} onChange={(e) => setAction(e.target.value)}>
        {['', 'template_read', 'template_write', 'template_store', 'template_delete', 'user_create', 'user_delete', 'block', 'unblock', 'resync', 'enroll_start', 'erase', 'consent_record', 'consent_withdraw', 'reconcile', 'backup', 'migration'].map((a) => (
          <option key={a} value={a}>
            {a || 'all actions'}
          </option>
        ))}
      </select>
      <Table head={['Time', 'Actor', 'Action', 'Student', 'Terminal', 'Result', 'Details']}>
        {logs.map((l) => (
          <tr key={l._id}>
            <td className={`${td} text-xs`}>{formatDateTime(l.timestamp)}</td>
            <td className={`${td} text-xs`}>{l.actor}</td>
            <td className={td}>{l.action}</td>
            <td className={td}>{l.student ? `${l.student.name} (${l.student.sapId})` : '—'}</td>
            <td className={td}>{l.terminal || '—'}</td>
            <td className={td}>{l.result}</td>
            <td className={`${td} max-w-md truncate text-xs`} title={JSON.stringify(l.details)}>
              {l.details ? JSON.stringify(l.details) : ''}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function JobsTab() {
  const [jobs, setJobs] = useState([]);
  const load = useCallback(() => getSyncJobsApi().then((r) => setJobs(r.data.jobs)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  useSyncEvents(load);
  return (
    <Table head={['Job', 'Terminal', 'Status', 'Progress', 'Errors', 'Started', 'Finished']}>
      {jobs.map((j) => (
        <tr key={j.jobId}>
          <td className={`${td} text-xs`}>{j.jobId}</td>
          <td className={td}>{j.terminalSN}</td>
          <td className={td}>
            <Pill value={j.status === 'completed' ? 'ok' : j.status === 'paused' ? 'failed' : 'pending'} label={j.status} />
          </td>
          <td className={td}>
            {j.done}/{j.total}
          </td>
          <td className={`${td} max-w-xs truncate text-xs`}>{(j.errorMessages || []).slice(-1)[0] || '—'}</td>
          <td className={`${td} text-xs`}>{formatDateTime(j.startedAt)}</td>
          <td className={`${td} text-xs`}>{formatDateTime(j.finishedAt)}</td>
        </tr>
      ))}
    </Table>
  );
}

export default function TerminalSync() {
  const [tab, setTab] = useState('terminals');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HiOutlineStatusOnline className="h-6 w-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Terminal Sync</h1>
      </div>
      <SyncHealthPanel />
      <div className={card}>
        <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === key ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'terminals' && <TerminalsTab />}
        {tab === 'commands' && <CommandsTab />}
        {tab === 'reconciliation' && <ReconciliationTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'jobs' && <JobsTab />}
      </div>
    </div>
  );
}
