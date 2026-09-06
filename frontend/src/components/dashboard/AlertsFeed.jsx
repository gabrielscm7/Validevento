function formatTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const TYPE_CFG = {
  duplicate:          { emoji: '⚠️', label: 'Duplicata',        cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  blocked_attempt:    { emoji: '🚫', label: 'Bloqueado',        cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
  master_use:         { emoji: '🎟️', label: 'Master',          cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300' },
  cortesia:           { emoji: '🎁', label: 'Cortesia',         cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' },
  liberacao_especial: { emoji: '🕊️', label: 'Liberação',       cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300' },
}

export function AlertsFeed({ data, loading }) {
  if (loading) {
    return (
      <div className="card p-5 animate-pulse">
        <div className="h-4 w-24 bg-muted rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  const alerts = data ?? []

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Alertas e Ocorrências</h3>
      {alerts.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-6">Nenhum alerta</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {alerts.map((a) => {
            const cfg = TYPE_CFG[a.type] ?? { emoji: '📌', label: a.type || 'Ocorrência', cls: 'bg-muted text-muted-foreground' }
            return (
              <div
                key={a.id}
                className="flex items-start gap-3 p-2.5 rounded-xl bg-secondary/60 border border-border"
              >
                <span className="text-lg mt-0.5" aria-hidden="true">{cfg.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {a.display_name ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.ticket_code ? `${a.ticket_code} · ` : ''}
                    {a.validator_name ? `${a.validator_name} · ` : ''}
                    {a.terminal_name ? `${a.terminal_name} · ` : ''}
                    {formatTime(a.created_at)}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
