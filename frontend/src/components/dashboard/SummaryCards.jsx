const CARDS = [
  { key: 'total',     label: 'Total',         bg: 'bg-muted', icon: '📋' },
  { key: 'active',    label: 'Ativos',        bg: 'bg-blue-50 dark:bg-blue-500/10', icon: '🔗' },
  { key: 'validated', label: 'Validados',     bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: '✅' },
  { key: 'blocked',   label: 'Bloqueados',    bg: 'bg-red-50 dark:bg-red-500/10', icon: '🚫' },
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
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {CARDS.map((c) => (
        <div key={c.key} className={`${c.bg} border border-border rounded-2xl p-4`}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.label}</p>
          <p className="text-3xl font-bold mt-1 text-foreground">
            {data[c.key] ?? 0}
          </p>
        </div>
      ))}
    </div>
  )
}
