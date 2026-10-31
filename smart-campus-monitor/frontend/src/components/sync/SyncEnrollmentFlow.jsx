import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineFingerPrint, HiOutlineRefresh } from 'react-icons/hi';
import {
  fetchEnrollmentTemplateApi,
  getEnrollmentMethodsApi,
  getStudentsApi,
  getStudentSyncApi,
  getSyncEnrollmentStatusApi,
  getSyncGroupsApi,
  startSyncEnrollmentApi,
} from '../../services/api';
import ConsentForm from './ConsentForm';
import FingerprintStatusBadge from './FingerprintStatusBadge';
import useSyncEvents from './useSyncEvents';
import { Pill, btnPrimary, btnSecondary, card, errorMessage, input, td, th } from './syncUi';

/**
 * Enrol once, copy everywhere: pick student → consent → target groups → capture on the
 * enrollment terminal's menu → template arrives → automatic fan-out (progress per terminal).
 */
export default function SyncEnrollmentFlow({ initialStudentId = '' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [studentId, setStudentId] = useState(initialStudentId);
  const [status, setStatus] = useState(null);
  const [sync, setSync] = useState(null);
  const [methods, setMethods] = useState([]);
  const [method, setMethod] = useState('menu');
  const [groups, setGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [finger, setFinger] = useState(0);
  const [started, setStarted] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getEnrollmentMethodsApi()
      .then((r) => {
        setMethods(r.data.methods);
        setMethod(r.data.defaultMethod);
      })
      .catch(() => {});
    getSyncGroupsApi()
      .then((r) => setGroups(r.data.groups.filter((g) => g.group !== 'enrollment')))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const [s, y] = await Promise.all([getSyncEnrollmentStatusApi(studentId), getStudentSyncApi(studentId)]);
      setStatus(s.data);
      setSync(y.data);
      if (!selectedGroups.length) setSelectedGroups(y.data.student.targetTerminalGroups || []);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setStarted(null);
    setSelectedGroups([]);
    load();
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps
  useSyncEvents(load);

  // Poll while waiting for the template (push upload may take a few polls).
  useEffect(() => {
    if (!started || status?.fingerprintStatus === 'enrolled') return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [started, status?.fingerprintStatus, load]);

  const search = async (event) => {
    event.preventDefault();
    try {
      const response = await getStudentsApi({ search: query, limit: 10 });
      setResults(response.data.students || []);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const start = async () => {
    setBusy(true);
    try {
      const response = await startSyncEnrollmentApi(studentId, { method, targetGroups: selectedGroups, fingerIndex: Number(finger) });
      setStarted(response.data);
      toast.success('Enrolment started');
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const fetchTemplate = async () => {
    setBusy(true);
    try {
      const response = await fetchEnrollmentTemplateApi(studentId);
      toast.success(
        response.data.mode === 'push_query'
          ? 'Template query sent to the terminal'
          : `Found ${response.data.found} template(s), stored ${response.data.stored}`
      );
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleGroup = (group) =>
    setSelectedGroups((prev) => (prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]));

  const targets = (sync?.terminals || []).filter((t) => t.desired);

  return (
    <div className={`${card} space-y-4`}>
      <div className="flex items-center gap-2">
        <HiOutlineFingerPrint className="h-5 w-5 text-primary-600" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Enrol once, copy to terminals</h2>
      </div>

      <form onSubmit={search} className="flex gap-2">
        <input className={input} placeholder="Search student by name or SAP ID" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className={btnSecondary} type="submit">
          Search
        </button>
      </form>
      {results.length > 0 && (
        <ul className="max-h-40 divide-y divide-gray-100 overflow-y-auto rounded border border-gray-200 text-sm dark:divide-gray-700 dark:border-gray-700">
          {results.map((s) => (
            <li key={s._id}>
              <button
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 ${s._id === studentId ? 'bg-primary-50 dark:bg-gray-700' : ''}`}
                onClick={() => {
                  setStudentId(s._id);
                  setResults([]);
                }}
              >
                <span className="text-gray-800 dark:text-gray-100">
                  {s.name} <span className="text-gray-500">({s.sapId})</span>
                </span>
                <FingerprintStatusBadge status={s.fingerprintStatus} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {status && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <span className="font-medium">{status.name}</span>
            <span>PIN {status.pin || '(assigned on start)'}</span>
            <FingerprintStatusBadge status={status.fingerprintStatus} />
          </div>

          {!status.consent ? (
            <ConsentForm studentId={studentId} onSaved={load} />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm text-gray-700 dark:text-gray-200">
                  Method
                  <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
                    {methods.map((m) => (
                      <option key={m.method} value={m.method} disabled={!m.ok}>
                        {m.method}
                        {!m.ok ? ` (unavailable: ${m.reason})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-gray-700 dark:text-gray-200">
                  Finger
                  <select className={input} value={finger} onChange={(e) => setFinger(e.target.value)}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-sm text-gray-700 dark:text-gray-200">
                  Target groups
                  <div className="mt-1 flex flex-wrap gap-2">
                    {groups.map((g) => (
                      <label key={g.group} className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-600">
                        <input type="checkbox" checked={selectedGroups.includes(g.group)} onChange={() => toggleGroup(g.group)} />
                        {g.group} ({g.terminals.length})
                      </label>
                    ))}
                    {!groups.length && <span className="text-xs text-gray-500">Default groups</span>}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} onClick={start} disabled={busy}>
                  Capture on enrollment terminal
                </button>
                <button className={btnSecondary} onClick={fetchTemplate} disabled={busy || !status.pin}>
                  <HiOutlineRefresh className="h-4 w-4" /> Fetch template
                </button>
              </div>

              {started && (
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                  {started.instructions}
                </div>
              )}
            </>
          )}

          <ol className="flex flex-wrap gap-3 text-xs">
            {[
              ['Consent', Boolean(status.consent)],
              ['User on enrollment terminal', Boolean(status.pin)],
              ['Template stored', status.fingerprintStatus === 'enrolled'],
              ['Copied to all targets', targets.length > 0 && targets.every((t) => t.status === 'present')],
            ].map(([label, done], index) => (
              <li key={label} className={`rounded-full px-3 py-1 ${done ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                {index + 1}. {label}
              </li>
            ))}
          </ol>

          {targets.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className={th}>Fan-out target</th>
                    <th className={th}>Status</th>
                    <th className={th}>Fingers on terminal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {targets.map((t) => (
                    <tr key={t.terminalSN}>
                      <td className={td}>
                        {t.terminalLabel || t.terminalSN} <span className="text-xs text-gray-500">{t.online ? '' : '(offline – will sync on next poll)'}</span>
                      </td>
                      <td className={td}>
                        <Pill value={t.status} />
                      </td>
                      <td className={td}>{t.fingers.length ? t.fingers.join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
