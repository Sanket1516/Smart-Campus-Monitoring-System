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
import TerminalDevice from '../brand/TerminalDevice';
import FingerprintStatusBadge from './FingerprintStatusBadge';
import useSyncEvents from './useSyncEvents';
import { btnPrimary, btnSecondary, card, errorMessage, input, td, th } from './syncUi';
import { EnrollmentStateBadge, GateStatusBadge, ROLE_LABELS, SimulatedBadge, SyncStatusBadge, gateFor } from './SyncStatusBadges';

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

  // Poll while capture or synchronisation is in progress.
  const inProgress =
    status?.enrollmentState === 'waiting_capture' ||
    (status?.fingerprintStatus === 'enrolled' && !['FULLY_SYNCHRONIZED', 'BLOCKED_REMOVED'].includes(status?.syncStatus));
  useEffect(() => {
    if (!studentId || !inProgress) return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [studentId, inProgress, load]);

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
      toast.success(response.data.simulated ? 'Enrolment started (SIMULATED device)' : 'Enrolment started on Device 1');
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

  const gateSync = status?.gateSync || [];
  const entryGate = gateFor(gateSync, 'GATE_ENTRY');
  const exitGate = gateFor(gateSync, 'GATE_EXIT');
  const canRetry = ['failed', 'timeout'].includes(status?.enrollmentState);

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
        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-2">
            <TerminalDevice
              mode="ENROLLMENT"
              title="DEVICE 1"
              state={
                status.enrollmentState === 'waiting_capture'
                  ? 'scanning'
                  : ['failed', 'timeout'].includes(status.enrollmentState)
                    ? 'denied'
                    : status.fingerprintStatus === 'enrolled'
                      ? 'ok'
                      : 'idle'
              }
              lines={
                status.enrollmentState === 'waiting_capture'
                  ? [`USER ID ${status.pin || '—'}`, 'ENROL ON DEVICE MENU']
                  : status.fingerprintStatus === 'enrolled'
                    ? [`USER ID ${status.pin}`, 'TEMPLATE STORED']
                    : ['READY']
              }
            />
            <p className="max-w-[14rem] text-center text-[11px] text-ink-400">
              Device state reflects the real enrolment status reported by the backend.
            </p>
          </div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <span className="font-medium">{status.name}</span>
            <span>ZK user ID {status.pin || '(assigned on start)'}</span>
            <FingerprintStatusBadge status={status.fingerprintStatus} />
            <EnrollmentStateBadge state={status.enrollmentState} />
            <SyncStatusBadge status={status.syncStatus} />
            <SimulatedBadge show={status.enrollmentSimulated} />
          </div>
          {status.accessStatus === 'blocked' && (
            <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">Student is blocked. Unblock before enrolment.</p>
          )}
          {status.enrollmentError && (
            <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              Capture result: {status.enrollmentError}
            </p>
          )}
          {status.enrollmentState === 'captured' && status.enrollmentDeviceSN && (
            <p className="text-xs text-gray-500">
              Captured on {status.enrollmentDeviceSN}
              {status.fingerprintEnrolledAt ? ` at ${new Date(status.fingerprintEnrolledAt).toLocaleString('en-IN')}` : ''}.
            </p>
          )}

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
                <button className={btnPrimary} onClick={start} disabled={busy || status.accessStatus === 'blocked'}>
                  {canRetry ? 'Retry enrolment on Device 1' : status.fingerprintStatus === 'enrolled' ? 'Re-enrol on Device 1' : 'Start enrolment on Device 1'}
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
              ['User on Device 1', Boolean(status.pin)],
              ['Finger captured on Device 1', status.enrollmentState === 'captured' || status.fingerprintStatus === 'enrolled'],
              ['Template stored (encrypted)', status.fingerprintStatus === 'enrolled'],
              ['Gate Entry verified', entryGate?.status === 'verified'],
              ['Gate Exit verified', exitGate?.status === 'verified'],
              ['Fully synchronized', status.syncStatus === 'FULLY_SYNCHRONIZED'],
            ].map(([label, done], index) => (
              <li key={label} className={`rounded-full px-3 py-1 ${done ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                {index + 1}. {label}
              </li>
            ))}
          </ol>

          {gateSync.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className={th}>Gate</th>
                    <th className={th}>Terminal</th>
                    <th className={th}>Status</th>
                    <th className={th}>Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {gateSync.map((g) => {
                    const terminal = (sync?.terminals || []).find((t) => t.terminalSN === g.terminalSN);
                    return (
                      <tr key={g.terminalSN}>
                        <td className={td}>{ROLE_LABELS[g.deviceRole] || g.deviceRole}</td>
                        <td className={td}>
                          {g.terminalLabel || g.terminalSN}{' '}
                          {terminal && !terminal.online && <span className="text-xs text-gray-500">(offline – syncs when it reconnects)</span>}
                        </td>
                        <td className={td}>
                          <GateStatusBadge gate={g} />
                        </td>
                        <td className={`${td} whitespace-normal text-xs`}>{g.detail}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
}
