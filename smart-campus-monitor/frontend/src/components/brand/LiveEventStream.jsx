import { useSocket } from '../../context/SocketContext';

const STYLE = {
  'scan:live': (e) => (e.type === 'exit' ? ['bg-primary-400', 'Exited campus'] : ['bg-emerald-400', 'Entered campus']),
  'scan:blocked': () => ['bg-red-400', 'Blocked student denied'],
  'scan:unauthorized': () => ['bg-red-400', 'Unauthorised fingerprint attempt'],
  'scan:warden_required': () => ['bg-amber-400', 'Warden approval required'],
  'terminal:online': () => ['bg-emerald-400', 'Terminal connected'],
  'terminal:offline': () => ['bg-ink-400', 'Terminal disconnected'],
  'warden:new_request': () => ['bg-primary-400', 'New hosteller exit request'],
  'warden:late_return': () => ['bg-amber-400', 'Late return flagged'],
  'unknown:terminal': () => ['bg-red-400', 'Unregistered terminal refused'],
};

/** Map today's recorded activity (from /api/dashboard liveActivity) to stream items. */
const fromRecorded = (item) => ({
  id: `rec-${item.id}`,
  eventName: item.type === 'unauthorized' ? 'scan:unauthorized' : 'scan:live',
  type: item.type,
  studentName: item.studentName || '',
  sapId: item.sapId || '',
  label: item.terminalLabel || item.gateName || '',
  time: item.time,
  recorded: true,
});

/**
 * Real events only: socket events received in this session, followed by today's
 * recorded activity passed in `recent` (from the dashboard API). Nothing is synthesised.
 */
export default function LiveEventStream({ limit = 12, className = '', recent = [] }) {
  const { liveEvents: socketEvents = [], connected } = useSocket();
  const liveEvents = [...socketEvents, ...recent.map(fromRecorded)];
  return (
    <section className={`panel flex flex-col p-5 ${className}`} aria-live="polite" aria-label="Live event stream">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="eyebrow">Live event stream</p>
          <p className="mt-1 text-xs text-ink-400">Live socket events, then today's recorded activity</p>
        </div>
        <span className={connected ? 'chip-ok' : 'chip-warn'}>
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'animate-pulse bg-emerald-400' : 'bg-amber-400'}`} />
          {connected ? 'Connected' : 'Reconnecting'}
        </span>
      </div>
      {liveEvents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
          <span className="relative mb-3 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-50" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-400" />
          </span>
          <p className="text-sm text-ink-200">Listening for gate events</p>
          <p className="mt-1 text-xs text-ink-400">Scans, denials and terminal changes appear here the moment they happen.</p>
        </div>
      ) : (
        <ul className="space-y-2 overflow-y-auto">
          {liveEvents.slice(0, limit).map((event) => {
            const [dot, label] = (STYLE[event.eventName] || (() => ['bg-primary-400', event.eventName]))(event);
            return (
              <li key={event.id} className={`flex items-start gap-3 rounded-xl border border-white/5 px-3 py-2.5 ${event.recorded ? 'bg-transparent' : 'animate-rise bg-white/[0.03]'}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">
                    {label}
                    {event.studentName && <span className="text-ink-300"> · {event.studentName}</span>}
                  </div>
                  <div className="truncate font-mono text-[10px] text-ink-400">
                    {[event.sapId, event.label, new Date(event.time).toLocaleTimeString('en-IN', { hour12: false })].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
