import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice, EmptyState } from '../../components/feedback'
import { getClient, getClientUsage } from '../../services/clientsService'
import { listEvents } from '../../services/eventsService'
import { listUsers } from '../../services/usersService'
import { getAuditLog } from '../../services/reportsService'
import { formatDateTime, ROLE_LABEL } from '../../lib/format'

function QuotaBar({ label, used, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium" style={{ color: 'var(--text-strong)' }}>{label}</span>
        <span className="text-muted">{used} / {max}</span>
      </div>
      <div className="progress">
        <div className={`bar ${pct >= 100 ? '' : 'purple'}`}
          style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--danger)' : undefined }} />
      </div>
    </div>
  )
}

const ROLE_KEYS = [
  ['admins', 'Admins'],
  ['supervisors', 'Supervisores'],
  ['validators', 'Validadores'],
  ['tickets_this_month', 'Ingressos no mês'],
  ['events_active', 'Eventos ativos'],
]

export default function ClientDetail() {
  const { id } = useParams()
  const [client, setClient] = useState(null)
  const [usage, setUsage] = useState(null)
  const [users, setUsers] = useState(null)
  const [events, setEvents] = useState(null)
  const [audit, setAudit] = useState([])
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [c, u, ev, us] = await Promise.all([
        getClient(id),
        getClientUsage(id),
        listEvents({ tenant_id: id }),
        listUsers(id),
      ])
      setClient(c)
      setUsage(u)
      setEvents(ev)
      setUsers(us)
      // Auditoria: agrega últimos logs dos eventos do tenant.
      const auditEntries = []
      await Promise.all((ev || []).slice(0, 5).map(async (event) => {
        try {
          const rows = await getAuditLog(event.id, 20)
          auditEntries.push(...rows.map((r) => ({ ...r, event_name: event.name })))
        } catch { /* sem auditoria p/ esse evento */ }
      }))
      auditEntries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setAudit(auditEntries.slice(0, 50))
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar cliente.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return (<div className="page"><TopBar crumb="Clientes" /><PageLoader /></div>)
  if (error && !client) return (<div className="page"><TopBar crumb="Clientes" /><div className="page-body"><ErrorNotice>{error}</ErrorNotice></div></div>)

  return (
    <div className="page">
      <TopBar crumb={`Master · ${client?.name}`} eventName={client?.name} />
      <div className="page-body">
        <section className="hero">
          <div>
            <p className="hero-eyebrow">Cliente</p>
            <h1 className="hero-title">{client?.name}</h1>
            <p className="hero-sub">
              {client?.email}
              {client?.cnpj ? ` · CNPJ ${client.cnpj}` : ''} · Plano {client?.plan}
              <span className="ml-2 badge badge-green">Ativo</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/master/clientes" className="btn-ghost btn">← Clientes</Link>
          </div>
        </section>

        <div className="tabs">
          {[
            ['overview', 'Visão geral'],
            ['users', 'Usuários'],
            ['events', 'Eventos'],
            ['audit', 'Auditoria'],
          ].map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === 'overview' && usage && (
          <div className="card card-pad">
            <h2 className="card-title mb-4">Uso vs. cotas</h2>
            {ROLE_KEYS.map(([key, label]) => {
              const item = usage[key]
              if (!item) return null
              return <QuotaBar key={key} label={label} used={item.used} max={item.max} />
            })}
          </div>
        )}

        {tab === 'users' && (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {(users || []).map((u) => (
                    <tr key={u.id}>
                      <td className="font-medium" style={{ color: 'var(--text-strong)' }}>{u.name}</td>
                      <td>{u.email}</td>
                      <td><span className={`pill ${u.role === 'admin' ? 'pill-purple' : u.role === 'supervisor' ? 'pill-blue' : 'pill-gray'}`}>{ROLE_LABEL[u.role]}</span></td>
                      <td>{u.active ? <span className="badge badge-green">Ativo</span> : <span className="badge badge-red">Inativo</span>}</td>
                    </tr>
                  ))}
                  {(!users || users.length === 0) && (
                    <tr><td colSpan={4}><EmptyState title="Sem usuários" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'events' && (
          <div className="grid">
            {(events || []).map((e) => (
              <div key={e.id} className="entity-row">
                <span className="entity-avatar blue">{e.name?.slice(0, 1)}</span>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>{e.name}</p>
                  <p className="text-xs text-muted truncate">
                    {formatDateTime(e.date)} · {e.tickets_count} ingressos · {e.validated_count} validados
                  </p>
                </div>
                <span className={`badge ${
                  e.status === 'active' ? 'badge-green' : e.status === 'draft' ? 'badge-gray' : 'badge-red'
                }`}>{e.status}</span>
              </div>
            ))}
            {(!events || events.length === 0) && (
              <div className="card"><EmptyState title="Nenhum evento" /></div>
            )}
          </div>
        )}

        {tab === 'audit' && (
          <div className="card">
            <div className="card-pad">
              <h2 className="card-title mb-4">Log de auditoria (eventos do cliente)</h2>
            </div>
            <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr><th>Data</th><th>Ação</th><th>Usuário</th><th>Evento</th></tr>
                </thead>
                <tbody>
                  {audit.map((a, i) => (
                    <tr key={`${a.created_at}-${i}`}>
                      <td className="text-xs">{formatDateTime(a.created_at)}</td>
                      <td className="mono text-sm">{a.action}</td>
                      <td>{a.user_name || '—'}</td>
                      <td className="text-sm text-muted">{a.event_name || '—'}</td>
                    </tr>
                  ))}
                  {audit.length === 0 && (
                    <tr><td colSpan={4}><EmptyState title="Sem registros de auditoria" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
