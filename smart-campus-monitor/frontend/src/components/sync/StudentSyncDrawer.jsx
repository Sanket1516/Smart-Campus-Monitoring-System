import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineRefresh, HiOutlineTrash, HiOutlineX } from 'react-icons/hi';
import { eraseBiometricsApi, getStudentSyncApi, resyncStudentApi, setStudentGroupsApi } from '../../services/api';
import FingerprintStatusBadge from './FingerprintStatusBadge';
import { GateStatusBadge, ROLE_LABELS, SyncStatusBadge } from './SyncStatusBadges';
import ConsentForm from './ConsentForm';
import useSyncEvents from './useSyncEvents';
import { Pill, btnDanger, btnPrimary, btnSecondary, errorMessage, formatDateTime, input, td, th } from './syncUi';

/** Per-student sync drawer: status on every terminal (present / pending / failed). */
export default function StudentSyncDrawer({ studentId, onClose, readOnly = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groupsText, setGroupsText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await getStudentSyncApi(studentId);
      setData(response.data);
      setGroupsText((response.data.student?.targetTerminalGroups || []).join(', '));
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to load sync status'));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);
  useSyncEvents(() => load());

  const run = async (fn, success) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const saveGroups = () =>
    run(
      () => setStudentGroupsApi(studentId, groupsText.split(',').map((g) => g.trim()).filter(Boolean)),
      'Terminal groups updated; sync queued'
    );

  const erase = () => {
    const sapId = window.prompt(
      `De-enrol and ERASE all fingerprint data for ${data.student.name}?\nThis deletes them from every terminal and from the database and cannot be undone.\nType the SAP ID to confirm:`
    );
    if (!sapId) return;
    run(() => eraseBiometricsApi(studentId, sapId.trim(), 'de-enrolment from student drawer'), 'Erasure queued and templates deleted');
  };

  const counts = (data?.terminals || []).filter((t) => t.desired || t.present || t.status !== 'absent').reduce(
    (acc, t) => ({ ...acc, [t.status]: (acc[t.status] || 0) + 1 }),
    {}
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Terminal sync</h2>
            {data && (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {data.student.name} · SAP {data.student.sapId} · PIN {data.student.pin || '—'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
            <HiOutlineX className="h-5 w-5" />
          </button>
        </div>

        {loading && <p className="text-sm text-gray-500">Loading…</p>}

        {data && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <FingerprintStatusBadge status={data.student.fingerprintStatus} />
              <SyncStatusBadge status={data.syncStatus} />
              <Pill value={data.student.accessStatus === 'blocked' ? 'failed' : 'ok'} label={data.student.accessStatus} />
              {Object.entries(counts).map(([status, count]) => (
                <Pill key={status} value={status} label={`${count} ${status}`} />
              ))}
            </div>

            {data.gateSync?.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.gateSync.map((g) => (
                  <div key={g.terminalSN} className="rounded-lg border border-gray-200 p-2 text-xs dark:border-gray-700">
                    <div className="font-medium text-gray-800 dark:text-gray-100">
                      {ROLE_LABELS[g.deviceRole] || g.deviceRole} · {g.terminalLabel || g.terminalSN}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <GateStatusBadge gate={g} /> <span className="text-gray-500">{g.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!data.consent && !readOnly && <ConsentForm studentId={studentId} onSaved={load} />}
            {data.consent && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Consent recorded {formatDateTime(data.consent.recordedAt)} by {data.consent.givenBy}
                {data.consent.isMinor ? ' (minor)' : ''}.
              </p>
            )}

            <div>
              <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-200">Stored templates</h3>
              {data.templates.length ? (
                <ul className="text-xs text-gray-600 dark:text-gray-300">
                  {data.templates.map((t) => (
                    <li key={t.fingerIndex}>
                      Finger {t.fingerIndex} · flag {t.flag} · {t.sizeBytes} bytes · sha256 {t.sha256Prefix}… · from {t.sourceTerminal || '—'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">None. Capture on the enrollment terminal.</p>
              )}
            </div>

            {!readOnly && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Target terminal groups
                </label>
                <div className="flex gap-2">
                  <input className={input} value={groupsText} onChange={(e) => setGroupsText(e.target.value)} placeholder="gate, hostel:<id>" />
                  <button className={btnSecondary} onClick={saveGroups} disabled={busy}>
                    Save
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className={th}>Terminal</th>
                    <th className={th}>Target</th>
                    <th className={th}>Status</th>
                    <th className={th}>Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.terminals.map((terminal) => (
                    <tr key={terminal.terminalSN}>
                      <td className={td}>
                        <div className="font-medium">{terminal.terminalLabel || terminal.terminalSN}</div>
                        <div className="text-xs text-gray-500">
                          {terminal.terminalSN} · {terminal.online ? 'online' : 'offline'}
                        </div>
                      </td>
                      <td className={td}>{terminal.desired ? 'yes' : '—'}</td>
                      <td className={td}>
                        <Pill value={terminal.status} />
                      </td>
                      <td className={`${td} whitespace-normal text-xs`}>
                        {terminal.commands.map((c) => (
                          <div key={c._id}>
                            {c.type} #{c.cmdId} {c.status}
                            {c.lastError ? ` – ${c.lastError}` : ''}
                          </div>
                        ))}
                        {!terminal.commands.length && terminal.lastConfirmedAt && (
                          <span>confirmed {formatDateTime(terminal.lastConfirmedAt)} ({terminal.source})</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!readOnly && (
              <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button className={btnPrimary} disabled={busy} onClick={() => run(() => resyncStudentApi(studentId), 'Resync queued')}>
                  <HiOutlineRefresh className="h-4 w-4" /> Resync
                </button>
                <button className={btnDanger} disabled={busy} onClick={erase}>
                  <HiOutlineTrash className="h-4 w-4" /> De-enrol &amp; erase
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
