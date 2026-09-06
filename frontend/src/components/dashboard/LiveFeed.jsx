import { formatTimeSec } from '../../lib/format'

const TYPE_BADGE = {
  authorized: { label: 'ENTROU', cls: 'badge-green' },
  duplicate: { label: 'DUPLICATA', cls: 'badge-yellow' },
  master: { label: 'MASTER', cls: 'badge-purple' },
  cortesia: { label: 'CORTESIA', cls: 'badge-purple' },
  liberacao_especial: { label: 'LIBERAÇÃO', cls: 'badge-blue' },
}

export function LiveFeed({ data, loading }) {
  if (loading) return <div className="card card-pad">Carregando…</div>
  const rows = data || []

  return (
    <div className="card card-pad">
      <div className="card-head">
        <h3 className="card-title">Feed ao vivo</h3>
        <span className="badge badge-gray">{rows.length}</span>
      </div>
      {rows.length === 0 && <p className="text-muted text-sm text-center py-6">Aguardando validações…</p>}
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {rows.map((l) => {
          const badge = l.entry_type === 'master' ? TYPE_BADGE.master
            : l.is_duplicate ? TYPE_BADGE.duplicate
            : l.origin === 'cortesia' ? TYPE_BADGE.cortesia
            : l.origin === 'liberacao_especial' ? TYPE_BADGE.liberacao_especial
            : TYPE_BADGE.authorized
          return (
            <div key={l.id} className="feed-line">
              <div className="flex-1 min-width-0" style={{ minWidth: 0 }}>
                <p className="font-medium text-sm truncate" style={{ color: 'var(--text-strong)' }}>{l.display_name}</p>
                <p className="text-xs text-muted truncate">
                  {l.batch || ''}
                  {l.validator_name ? ` · ${l.validator_name}` : ''}
                  {l.terminal_name ? ` · ${l.terminal_name}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`badge ${badge.cls}`}>{badge.label}</span>
                <p className="text-xs text-muted mt-1">{formatTimeSec(l.created_at)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default LiveFeed
