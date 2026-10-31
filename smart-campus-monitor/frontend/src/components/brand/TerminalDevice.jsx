import FingerprintGlyph from './FingerprintGlyph';

/**
 * Stylised eSSL X990-class biometric terminal (illustration, not a product photo).
 * mode: 'ENTRY' | 'EXIT' | 'ENROLLMENT'
 * state: 'idle' | 'scanning' | 'ok' | 'denied' | 'off'
 * Screen content comes from props so real status can be shown.
 */
const MODE = {
  ENTRY: { accent: '#10b981', label: 'ENTRY' },
  EXIT: { accent: '#5b8cff', label: 'EXIT' },
  ENROLLMENT: { accent: '#22d3ee', label: 'ENROLL' },
};

export default function TerminalDevice({
  mode = 'ENTRY',
  state = 'idle',
  title,
  lines = [],
  online = true,
  compact = false,
  className = '',
}) {
  const meta = MODE[mode] || MODE.ENTRY;
  const offline = !online || state === 'off';
  const screenTone =
    state === 'ok' ? '#10b981' : state === 'denied' ? '#f04444' : state === 'scanning' ? '#22d3ee' : meta.accent;
  return (
    <div
      className={`relative mx-auto select-none ${compact ? 'w-40' : 'w-56'} ${className}`}
      role="img"
      aria-label={`${meta.label} terminal ${offline ? 'offline' : state}`}
    >
      {/* body */}
      <div
        className="relative rounded-[22px] border p-3 pb-5"
        style={{
          background: 'linear-gradient(160deg, #1a2438 0%, #0b111d 55%, #070b14 100%)',
          borderColor: 'rgba(148,170,210,0.18)',
          boxShadow: `0 30px 60px -30px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 60px -30px ${offline ? 'transparent' : meta.accent}`,
        }}
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="font-mono text-[9px] tracking-[0.25em] text-ink-300">eSSL · X990</span>
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${offline ? '' : 'animate-pulse'}`}
              style={{ background: offline ? '#56677f' : meta.accent }}
            />
            <span className="font-mono text-[9px] text-ink-300">{offline ? 'OFFLINE' : 'ONLINE'}</span>
          </span>
        </div>
        {/* screen */}
        <div
          className={`relative overflow-hidden rounded-xl border ${compact ? 'h-24' : 'h-32'}`}
          style={{
            borderColor: 'rgba(148,170,210,0.15)',
            background: offline
              ? '#05080f'
              : `radial-gradient(120% 80% at 50% 0%, ${screenTone}26, #05080f 70%)`,
          }}
        >
          {!offline && (
            <div className="flex h-full flex-col justify-between p-2.5">
              <div className="flex items-center justify-between">
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-widest"
                  style={{ color: meta.accent, background: `${meta.accent}1f`, border: `1px solid ${meta.accent}55` }}
                >
                  {meta.label} MODE
                </span>
                <span className="font-mono text-[9px] text-ink-300">{title}</span>
              </div>
              <div className="space-y-0.5">
                {lines.slice(0, 3).map((line) => (
                  <div key={line} className="truncate font-mono text-[10px] text-ink-100">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}
          {offline && <div className="flex h-full items-center justify-center font-mono text-[10px] text-ink-400">NO SIGNAL</div>}
        </div>
        {/* sensor */}
        <div className="mt-3 flex justify-center">
          <div
            className="rounded-2xl border p-1.5"
            style={{ borderColor: 'rgba(148,170,210,0.15)', background: 'linear-gradient(180deg,#0b111d,#05080f)' }}
          >
            <FingerprintGlyph state={offline ? 'off' : state} size={compact ? 46 : 62} />
          </div>
        </div>
      </div>
      {/* stand */}
      <div className="mx-auto h-6 w-3 rounded-b bg-gradient-to-b from-ink-600 to-ink-800" />
      <div className="mx-auto h-1.5 w-20 rounded-full bg-black/50 blur-[2px]" />
    </div>
  );
}
