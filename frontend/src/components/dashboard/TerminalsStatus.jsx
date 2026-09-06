import { relativeTime } from '../../lib/format'

export function TerminalsStatus({ data, loading }) {
  if (loading) return <div className="card card-pad">Carregando terminais…</div>
  const rows = data || []

  return (
    <div className="card card-pad">
      <div className="card-head"><h3 className="card-title">Terminais</h3></div>
      {rows.length === 0 && <p className="text-muted text-sm text-center py-4">Nenhum terminal conectado</p>}
      <div className="grid grid-cols-2">
        {rows.map((t) => (
          <div key={t.id} className="entity-row" style={{ alignItems: 'center' }}>
            <span className={`dot ${t.online ? 'dot-green pulse' : 'dot-gray'}`} />
            <div className="flex-1" style={{ minWidth: 0 }}>
              <p className="font-medium text-sm truncate" style={{ color: 'var(--text-strong)' }}>{t.name}</p>
              <p className="text-xs text-muted">
                {t.online ? 'Online' : 'Offline'}
                {t.last_sync_at ? ` · sync ${relativeTime(t.last_sync_at)}` : ''}
              </p>
            </div>
            <span className="text-xs text-muted">{t.validations_today ?? 0} val.</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TerminalsStatus
