function formatTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const ENTRY_TYPE_LABEL = {
  qrcode: { label: 'QRCode', cls: 'badge-blue' },
  manual: { label: 'Manual', cls: 'badge-slate' },
}

export function LiveFeed({ data, loading }) {
  if (loading) {
    return (
      <div className="card p-5 animate-pulse">
        <div className="h-4 w-28 bg-muted rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  const entries = data ?? []

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Últimas entradas</h3>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-6">Nenhuma entrada registrada</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {entries.map((e) => {
            const typeCfg = ENTRY_TYPE_LABEL[e.entry_type] ?? { label: e.entry_type, cls: 'badge-slate' }
            return (
              <div key={e.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-secondary/60">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  e.is_duplicate ? 'bg-amber-400' : 'bg-emerald-500'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {e.display_name ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.ticket_code}
                    {e.batch ? ` · ${e.batch}` : ''}
                    {e.terminal_name ? ` · ${e.terminal_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={typeCfg.cls}>{typeCfg.label}</span>
                  <span className="text-xs text-muted-foreground">{formatTime(e.created_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
