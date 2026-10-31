import { Pill, formatDateTime } from './syncUi';
import { ROLE_LABELS, SimulatedBadge } from './SyncStatusBadges';

const ORDER = ['ADMIN_ENROLLMENT', 'GATE_ENTRY', 'GATE_EXIT'];

/** One card per role: Device 1 enrollment, Device 2 entry, Device 3 exit. */
export default function DeviceOverview({ devices }) {
  if (!devices) return null;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {ORDER.map((role, index) => {
        const list = devices[role] || [];
        if (!list.length) {
          return (
            <div key={role} className="rounded-xl border border-dashed border-red-300 p-4 text-sm dark:border-red-800">
              <div className="font-semibold text-gray-800 dark:text-gray-100">
                Device {index + 1}: {ROLE_LABELS[role]}
              </div>
              <p className="mt-1 text-red-600">Not registered. Assign this role on the Terminals tab.</p>
            </div>
          );
        }
        return list.map((t) => (
          <div key={t.serialNumber} className="rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-700">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-gray-800 dark:text-gray-100">
                Device {index + 1}: {ROLE_LABELS[role]}
              </div>
              <Pill value={t.online ? 'online' : 'offline'} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-gray-500">
              {t.terminalLabel} · SN {t.serialNumber} · {t.ip || 'no IP'} <SimulatedBadge show={t.simulated} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
              <dt>Model / firmware</dt>
              <dd>
                {t.deviceModel} · {t.firmware || 'unknown'}
              </dd>
              <dt>Protocol</dt>
              <dd>
                {t.communicationProtocol === 'zk_tcp_pull' ? 'Pull (ZK TCP via sidecar)' : `Push (${t.dialect})`}
              </dd>
              <dt>Last communication</dt>
              <dd>{formatDateTime(t.lastSeenAt)}</dd>
              <dt>Last successful sync</dt>
              <dd>{formatDateTime(t.lastSyncAt)}</dd>
              <dt>Users on device</dt>
              <dd>{t.enrolledUsers}</dd>
              <dt>Fingerprints stored / verified</dt>
              <dd>
                {t.fingerprintsStored} / {t.fingerprintsVerified}
              </dd>
              <dt>Pending / failed commands</dt>
              <dd>
                {t.pending} / <span className={t.failed ? 'font-semibold text-red-600' : ''}>{t.failed}</span>
              </dd>
            </dl>
          </div>
        ));
      })}
    </div>
  );
}
