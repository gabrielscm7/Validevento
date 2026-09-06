import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, ResponsiveContainer } from 'recharts'
import { formatDateTime } from '../../lib/format'
import api from '../../services/api'

const STATUS_META = {
  draft: { label: 'Rascunho', cls: 'badge-gray' },
  active: { label: 'Ativo', cls: 'badge-green' },
  closed: { label: 'Encerrado', cls: 'badge-red' },
}

/**
 * Card de evento (AdminHome / EventsList).
 * Mostra nome, data/local, status, ocupação e um mini gráfico de fluxo.
 */
export default function EventCard({ event }) {
  const navigate = useNavigate()
  const meta = STATUS_META[event.status] || STATUS_META.draft
  const occupancyPct = event.capacity
    ? Math.min(100, Math.round(((event.validated_count || 0) / event.capacity) * 100))
    : 0

  // Mini fluxo: buscas 3h do dashboard quando ativo.
  const [flow, setFlow] = useState(null)
  useEffect(() => {
    if (event.status !== 'active') return
    let active = true
    api.get(`/api/events/${event.id}/dashboard/flow`)
      .then(({ data }) => active && setFlow((data || []).slice(-8)))
      .catch(() => {})
    return () => { active = false }
  }, [event.id, event.status])

  return (
    <div className="card">
      <div className="card-pad">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1" style={{ minWidth: 0 }}>
            <h3 className="card-title truncate" style={{ fontSize: 16 }}>{event.name}</h3>
            <p className="card-sub mt-1 truncate">
              {formatDateTime(event.date)}
              {event.location ? ` · ${event.location}` : ''}
            </p>
          </div>
          <span className={`badge ${meta.cls}`}>{meta.label}</span>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted">Ocupação</span>
            <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>
              {(event.validated_count || 0)} / {event.capacity} · {occupancyPct}%
            </span>
          </div>
          <div className="progress">
            <div className="bar purple" style={{ width: `${occupancyPct}%` }} />
          </div>
        </div>

        {event.status === 'active' && flow && flow.length > 0 && (
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={48}>
              <BarChart data={flow}>
                <XAxis dataKey="hour" hide />
                <Bar dataKey="checkins" fill="#7c4fa0" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex gap-2 mt-4 flex-wrap">
          <Link to={`/supervisor/${event.id}`} className="btn-primary btn-sm btn">Acessar dashboard</Link>
          <Link to={`/admin/eventos/${event.id}/config`} className="btn-outline btn-sm btn">Configurar</Link>
          {event.status !== 'closed' && (
            <Link to={`/admin/eventos/${event.id}`} className="btn-ghost btn-sm btn">Editar</Link>
          )}
        </div>

        {event.status === 'active' && (
          <button type="button" className="btn-ghost btn-sm mt-2" style={{ color: 'var(--vv-blue)' }}
            onClick={() => navigate(`/terminal/${event.id}`)}>
            Abrir terminal →
          </button>
        )}
      </div>
    </div>
  )
}
