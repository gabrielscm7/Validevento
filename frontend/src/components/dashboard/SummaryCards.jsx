const CARDS = [
  { key: 'total_tickets', label: 'Total',        bg: 'bg-muted', icon: '📋', suffix: '' },
  { key: 'active',        label: 'Ativos',       bg: 'bg-blue-50 dark:bg-blue-500/10', icon: '🔗', suffix: '' },
  { key: 'validated',     label: 'Validados',    bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: '👥', suffix: '' },
  { key: 'blocked',       label: 'Bloqueados',   bg: 'bg-red-50 dark:bg-red-500/10', icon: '🚫', suffix: '' },
  { key: 'occupancy_pct', label: 'Ocupação',     bg: 'bg-amber-50 dark:bg-amber-500/10', icon: '📊', suffix: '%' },
  { key: 'cortesia',      label: 'Cortesias',    bg: 'bg-violet-50 dark:bg-violet-500/10', icon: '🎁', suffix: '' },
  { key: 'liberacao_especial', label: 'Liberações', bg: 'bg-cyan-50 dark:bg-cyan-500/10', icon: '🕊️', suffix: '' },
  { key: 'master_uses',   label: 'Ingresso Master', bg: 'bg-orange-50 dark:bg-orange-500/10', icon: '🎟️', suffix: '' },
  { key: 'duplicate_attempts', label: 'Duplicatas', bg: 'bg-rose-50 dark:bg-rose-500/10', icon: '⚠️', suffix: '' },
]

export function SummaryCards({ data, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {CARDS.map((c) => (
          <div key={c.key} className="card p-4 animate-pulse">
            <div className="h-4 w-16 bg-muted rounded mb-2" />
            <div className="h-8 w-12 bg-muted rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {CARDS.map((c) => {
        const value = data[c.key]
        return (
          <div key={c.key} className={`${c.bg} border border-border rounded-2xl p-4`}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.label}</p>
            <p className="text-3xl font-bold mt-1 text-foreground">
              {value != null ? `${value}${c.suffix}` : '—'}
            </p>
          </div>
        )
      })}
    </div>
  )
}
