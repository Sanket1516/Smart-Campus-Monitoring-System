/** Shared building blocks for the platform story. */
export const SampleTag = ({ children = 'Illustrative · sample data' }) => (
  <span className="chip-off font-mono uppercase tracking-[0.14em]">{children}</span>
);

export const Chapter = ({ id, index, eyebrow, title, intro, children, className = '', align = 'left' }) => (
  <section id={id} className={`relative scroll-mt-20 px-5 py-24 md:px-10 md:py-32 ${className}`}>
    <div className="mx-auto max-w-7xl">
      <div className={`reveal mb-12 max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
        <p className="eyebrow mb-4">
          {index ? `Chapter ${String(index).padStart(2, '0')} · ` : ''}
          {eyebrow}
        </p>
        <h2 className="display-lg text-white">{title}</h2>
        {intro && <p className="mt-5 text-base leading-relaxed text-ink-200 md:text-lg">{intro}</p>}
      </div>
      {children}
    </div>
  </section>
);

/** Numbered workflow steps; `active` highlights progress (sequence demos). */
export const Steps = ({ steps, active = -1, tone = '#22d3ee', className = '' }) => (
  <ol className={`space-y-2 ${className}`}>
    {steps.map((step, i) => {
      const done = i < active;
      const current = i === active;
      return (
        <li
          key={step}
          className={`flex items-start gap-3 rounded-xl border px-3 py-2 text-sm transition-all duration-500 ${
            current ? 'border-white/15 bg-white/[0.05] text-white' : done ? 'border-transparent text-ink-200' : 'border-transparent text-ink-400'
          }`}
        >
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]"
            style={{
              background: done || current ? `${tone}22` : 'rgba(255,255,255,0.04)',
              color: done || current ? tone : '#56677f',
              border: `1px solid ${done || current ? `${tone}66` : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            {done ? '✓' : i + 1}
          </span>
          <span>{step}</span>
        </li>
      );
    })}
  </ol>
);

export const Stat = ({ label, value, tone = 'text-white', hint }) => (
  <div>
    <div className={`metric text-3xl md:text-4xl ${tone}`}>{value}</div>
    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300">{label}</div>
    {hint && <div className="mt-0.5 text-[11px] text-ink-400">{hint}</div>}
  </div>
);

export const Row = ({ cells, className = '' }) => (
  <div className={`grid items-center gap-3 border-t border-white/5 px-4 py-2.5 text-sm ${className}`}>{cells}</div>
);
