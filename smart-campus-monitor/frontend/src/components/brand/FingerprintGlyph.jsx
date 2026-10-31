/**
 * Fingerprint glyph with a scanning beam.
 * state: 'idle' | 'scanning' | 'ok' | 'denied' | 'off'
 */
const RIDGES = [
  'M50 14c-17 0-31 13-31 30',
  'M81 44c0-17-14-30-31-30',
  'M26 48c0-14 10-25 24-25s24 11 24 25v6',
  'M33 62c-1-4-1-9-1-14 0-10 8-18 18-18s18 8 18 18c0 9-1 18-4 26',
  'M40 76c-2-8-3-17-3-28 0-7 6-12 13-12s13 5 13 12c0 13-2 25-7 35',
  'M50 48c0 15-2 29-8 41',
  'M57 48c0 11-1 21-4 30',
  'M22 66c-2-5-3-11-3-18',
  'M75 66c2-6 3-12 3-18',
  'M46 88c3-6 5-13 6-20',
];

const TONE = {
  idle: '#5b8cff',
  scanning: '#22d3ee',
  ok: '#10b981',
  denied: '#f04444',
  off: '#56677f',
};

export default function FingerprintGlyph({ state = 'idle', size = 120, className = '' }) {
  const color = TONE[state] || TONE.idle;
  return (
    <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`Fingerprint ${state}`}>
        <defs>
          <radialGradient id="fp-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="52" r="46" fill="url(#fp-glow)" />
        {RIDGES.map((d, i) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity={state === 'off' ? 0.35 : 0.55 + (i % 3) * 0.15}
            style={{ transition: 'stroke 0.4s ease' }}
          />
        ))}
      </svg>
      {state === 'scanning' && (
        <div className="pointer-events-none absolute inset-x-2 inset-y-0 overflow-hidden">
          <div
            className="h-1/3 w-full animate-scan-line"
            style={{ background: `linear-gradient(180deg, transparent, ${color}55, transparent)` }}
          />
        </div>
      )}
      {(state === 'ok' || state === 'denied') && (
        <span className="absolute inset-0 rounded-full animate-pulse-ring" style={{ boxShadow: `0 0 0 2px ${color}` }} />
      )}
    </div>
  );
}
