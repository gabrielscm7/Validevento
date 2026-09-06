import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice, EmptyState } from '../../components/feedback'
import EventCard from '../../components/admin/EventCard'
import { listEvents } from '../../services/eventsService'
import { Btn } from '../../components/ui'

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'draft', label: 'Rascunho' },
  { key: 'active', label: 'Ativo' },
  { key: 'closed', label: 'Encerrado' },
]

export default function EventsList() {
  const [events, setEvents] = useState(null)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listEvents(filter === 'all' ? {} : { status: filter })
      setEvents(data)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar eventos.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  return (
    <div className="page">
      <TopBar crumb="Admin · Eventos" />
      <div className="page-body">
        {error && <ErrorNotice>{error}</ErrorNotice>}

        <section className="hero">
          <div>
            <p className="hero-eyebrow">Eventos</p>
            <h1 className="hero-title">Todos os eventos</h1>
            <p className="hero-sub">Crie, configure e acompanhe todos os eventos do seu cliente.</p>
          </div>
          <div className="hero-actions">
            <Btn variant="primary" size="lg" onClick={() => navigate('/admin/eventos/novo')}>+ Criar evento</Btn>
          </div>
        </section>

        <div className="flex gap-2 mb-4 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f.key} type="button"
              className={`btn ${filter === f.key ? 'btn-primary' : 'btn-outline'} btn-sm`}
              onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>

        {loading && <PageLoader />}

        {!loading && events && events.length === 0 && (
          <div className="card"><EmptyState title="Nenhum evento" sub="Nenhum evento para este filtro." /></div>
        )}

        <div className="grid grid-cols-2">
          {(events || []).map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      </div>
    </div>
  )
}
