/**
 * Editorial page header: mono eyebrow, oversized display title, short statement,
 * optional actions and a right-hand "signal" slot (live numbers / status).
 */
export default function PageHeader({ eyebrow, title, description, actions, aside, motif = 'grid', className = '' }) {
  return (
    <header className={`keep-dark relative mb-6 overflow-hidden rounded-3xl border border-white/5 px-6 py-7 md:px-8 md:py-9 ${className}`}>
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900" />
      <div className={`absolute inset-0 -z-10 opacity-60 ${motif === 'grid' ? 'grid-bg' : 'aurora'}`} />
      <div className="absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-primary-600/10 blur-3xl" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
          <h1 className="display-md text-white">{title}</h1>
          {description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-200 md:text-base">{description}</p>}
          {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
    </header>
  );
}
