function formatTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
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
      <h3 className="text-sm font-semibold text-foreground mb-4">Alertas</h3>
      {alerts.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-6">Nenhum alerta</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/10"
            >
              <span className="text-lg mt-0.5" aria-hidden="true">
                {a.is_duplicate ? '⚠️' : '🚫'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {a.display_name ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {a.ticket_code}
                  {a.terminal_name ? ` · ${a.terminal_name}` : ''}
                  <span className="ml-2">{formatTime(a.created_at)}</span>
                </p>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                a.is_duplicate ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
              }`}>
                {a.is_duplicate ? 'Duplicata' : 'Bloqueado'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
