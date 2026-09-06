import { formatTimeSec } from '../../lib/format'

const TYPE_META = {
  duplicate: { label: 'Duplicata', cls: 'badge-yellow', icon: '⚠️' },
  blocked_attempt: { label: 'Bloqueado tentado', cls: 'badge-red', icon: '🚫' },
  master_use: { label: 'Ingresso master', cls: 'badge-purple', icon: '🎟' },
  cortesia: { label: 'Cortesia', cls: 'badge-purple', icon: '🎁' },
  liberacao_especial: { label: 'Liberação especial', cls: 'badge-blue', icon: '🕊' },
}

export function AlertsFeed({ data, loading }) {
  if (loading) return <div className="card card-pad">Carregando…</div>
  const rows = data || []

  return (
    <div className="card card-pad">
      <div className="card-head">
        <h3 className="card-title">Alertas</h3>
        {rows.length > 0 && <span className="badge badge-red">{rows.length}</span>}
      </div>
      {rows.length === 0 && (
        <p className="text-muted text-sm text-center py-6">Nenhum alerta registrado</p>
      )}
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {rows.map((a) => {
          const meta = TYPE_META[a.type] || { label: a.type, cls: 'badge-gray', icon: '•' }
          return (
            <div key={a.id} className="feed-line">
              <span aria-hidden="true">{meta.icon}</span>
              <div className="flex-1" style={{ minWidth: 0 }}>
                <p className="text-sm truncate" style={{ color: 'var(--text-strong)' }}>
                  <span className="font-medium">{a.display_name}</span>
                </p>
                <p className="text-xs text-muted truncate">
                  {a.validator_name || ''}
                  {a.terminal_name ? ` · ${a.terminal_name}` : ''} · {formatTimeSec(a.created_at)}
                </p>
              </div>
              <span className={`badge ${meta.cls}`}>{meta.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AlertsFeed
