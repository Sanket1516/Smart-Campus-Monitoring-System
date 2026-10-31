/**
 * The platform's signature diagram:
 * Admin enrolment → Backend + database → sync queue → Entry terminal / Exit terminal
 * → real-time events → monitoring. `status` = { admin, entry, exit } with
 * 'online' | 'offline' | 'unknown' | 'missing'. Without status the diagram is illustrative.
 */
const TONE = { online: '#10b981', offline: '#56677f', unknown: '#f59e0b', missing: '#f04444' };

const Node = ({ x, y, w = 168, h = 64, title, subtitle, tone = '#3d6dff', status }) => (
  <g transform={`translate(${x - w / 2} ${y - h / 2})`}>
    <rect width={w} height={h} rx="14" fill="rgba(15,23,38,0.92)" stroke={tone} strokeOpacity="0.55" />
    <rect width={w} height={h} rx="14" fill={`url(#nodeSheen)`} />
    <text x="16" y="27" fill="#eef2f8" fontFamily="Space Grotesk, Inter, sans-serif" fontSize="14" fontWeight="600">
      {title}
    </text>
    <text x="16" y="46" fill="#8593a8" fontFamily="JetBrains Mono, monospace" fontSize="10" letterSpacing="0.06em">
      {subtitle}
    </text>
    {status && (
      <g transform={`translate(${w - 18} 18)`}>
        <circle r="4.5" fill={TONE[status] || TONE.unknown} />
        {status === 'online' && <circle r="4.5" fill="none" stroke={TONE.online} className="animate-pulse-ring" style={{ transformOrigin: 'center', transformBox: 'fill-box' }} />}
      </g>
    )}
  </g>
);

const Edge = ({ d, color = '#22d3ee', dim = false }) => (
  <g>
    <path d={d} fill="none" stroke={color} strokeOpacity={dim ? 0.12 : 0.22} strokeWidth="2" />
    {!dim && <path d={d} fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 16" strokeLinecap="round" className="animate-dash-flow" />}
  </g>
);

export default function ArchitectureFlow({ status, labels = {}, className = '', caption }) {
  const s = status || {};
  const entryDim = s.entry === 'offline' || s.entry === 'missing';
  const exitDim = s.exit === 'offline' || s.exit === 'missing';
  return (
    <figure className={className}>
      <svg viewBox="0 0 980 360" className="h-auto w-full" role="img" aria-label="System architecture: administrator enrolment, backend, entry and exit terminals, monitoring">
        <defs>
          <linearGradient id="nodeSheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <Edge d="M 184 180 C 240 180, 260 180, 316 180" color="#22d3ee" />
        <Edge d="M 484 160 C 560 120, 580 92, 650 92" color="#10b981" dim={entryDim} />
        <Edge d="M 484 200 C 560 240, 580 268, 650 268" color="#5b8cff" dim={exitDim} />
        <Edge d="M 818 92 C 870 92, 870 180, 900 180" color="#10b981" dim={entryDim} />
        <Edge d="M 818 268 C 870 268, 870 180, 900 180" color="#5b8cff" dim={exitDim} />

        <Node x={100} y={180} title="Admin enrolment" subtitle={labels.admin || 'DEVICE 1 · CAPTURE'} tone="#22d3ee" status={s.admin} />
        <Node x={400} y={180} w={170} h={92} title="Backend + DB" subtitle="ENCRYPTED · QUEUE" tone="#3d6dff" />
        <text x="400" y="212" textAnchor="middle" fill="#56677f" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="0.08em">
          SOURCE OF TRUTH
        </text>
        <Node x={734} y={92} title="Entry terminal" subtitle={labels.entry || 'DEVICE 2 · ENTRY ONLY'} tone="#10b981" status={s.entry} />
        <Node x={734} y={268} title="Exit terminal" subtitle={labels.exit || 'DEVICE 3 · EXIT ONLY'} tone="#5b8cff" status={s.exit} />
        <g transform="translate(900 180)">
          <circle r="34" fill="rgba(15,23,38,0.92)" stroke="#22d3ee" strokeOpacity="0.5" />
          <text textAnchor="middle" y="-2" fill="#eef2f8" fontFamily="Space Grotesk, sans-serif" fontSize="11" fontWeight="600">
            LIVE
          </text>
          <text textAnchor="middle" y="13" fill="#8593a8" fontFamily="JetBrains Mono, monospace" fontSize="8">
            MONITOR
          </text>
        </g>
        <text x="250" y="166" textAnchor="middle" fill="#56677f" fontFamily="JetBrains Mono, monospace" fontSize="9">
          TEMPLATE
        </text>
        <text x="560" y="106" textAnchor="middle" fill="#56677f" fontFamily="JetBrains Mono, monospace" fontSize="9">
          USER + TEMPLATE · ACK · READ-BACK
        </text>
        <text x="560" y="262" textAnchor="middle" fill="#56677f" fontFamily="JetBrains Mono, monospace" fontSize="9">
          USER + TEMPLATE · ACK · READ-BACK
        </text>
      </svg>
      {caption && <figcaption className="mt-2 text-center text-xs text-ink-300">{caption}</figcaption>}
    </figure>
  );
}
