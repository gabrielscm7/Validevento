import { Link } from 'react-router-dom'

/** Linha de cliente na dashboard/lista do master. */
export function ClientRow({ client, onClick }) {
  const active = client.active
  const usageHint = `${client.max_admins} admin · ${client.max_supervisors} sup. · ${client.max_validators} val.`

  return (
    <div className="entity-row" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick?.()}>
      <span className={`dot ${active ? 'dot-green pulse' : 'dot-gray'}`} title={active ? 'Ativo' : 'Suspenso'} />
      <div className="flex-1 min-width-0" style={{ minWidth: 0 }}>
        <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>{client.name}</p>
        <p className="text-xs text-muted truncate">{usageHint}</p>
      </div>
      <span className={`pill ${active ? 'pill-purple' : 'pill-gray'}`}>
        {client.plan || 'basic'}
      </span>
      <Link
        to={`/master/clientes/${client.id}`}
        className="btn-outline btn-sm"
        onClick={(e) => e.stopPropagation()}
      >
        Ver uso
      </Link>
    </div>
  )
}
