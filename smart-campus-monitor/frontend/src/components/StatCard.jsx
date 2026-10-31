/**
 * Metric tile (Sentinel style): mono label, large tabular number, accent hairline.
 * Props unchanged from the original component.
 */
const ACCENTS = {
  blue: { line: 'from-primary-400', text: 'text-[#a5c0ff]', glow: 'rgba(61,109,255,0.18)' },
  green: { line: 'from-emerald-400', text: 'text-emerald-300', glow: 'rgba(16,185,129,0.16)' },
  red: { line: 'from-red-400', text: 'text-red-300', glow: 'rgba(240,68,68,0.16)' },
  yellow: { line: 'from-amber-400', text: 'text-amber-300', glow: 'rgba(245,158,11,0.16)' },
  orange: { line: 'from-amber-400', text: 'text-amber-300', glow: 'rgba(245,158,11,0.16)' },
  purple: { line: 'from-violet-400', text: 'text-violet-300', glow: 'rgba(167,139,250,0.16)' },
  indigo: { line: 'from-cyan-400', text: 'text-cyan-200', glow: 'rgba(34,211,238,0.14)' },
};

export default function StatCard({ title, value, subtitle, icon: Icon, color = 'blue', onClick, active = false }) {
  const accent = ACCENTS[color] || ACCENTS.blue;
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 ${
        active ? 'border-white/25 bg-white/[0.06]' : 'border-white/[0.07] bg-ink-800/80'
      } ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-white/20' : ''}`}
      style={{ boxShadow: active ? `0 0 0 1px rgba(255,255,255,0.06) inset, 0 20px 40px -24px ${accent.glow}` : undefined }}
    >
      <span className={`absolute inset-x-5 top-0 h-px bg-gradient-to-r ${accent.line} to-transparent opacity-80`} />
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-300">{title}</p>
        {Icon && <Icon className={`h-5 w-5 shrink-0 ${accent.text} opacity-80`} />}
      </div>
      <p className="metric mt-4 text-4xl text-white">{value}</p>
      {subtitle && <p className={`mt-1 text-sm ${accent.text}`}>{subtitle}</p>}
      {onClick && <p className="mt-3 text-[11px] text-ink-400 transition group-hover:text-ink-200">View students →</p>}
    </Component>
  );
}
