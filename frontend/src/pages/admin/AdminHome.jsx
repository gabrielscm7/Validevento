import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice, EmptyState } from '../../components/feedback'
import EventCard from '../../components/admin/EventCard'
import Btn from '../../components/ui'
import { listEvents } from '../../services/eventsService'
import { useTerminalStore } from '../../store/terminalStore'

function TicketHero() {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" aria-hidden="true" className="hero-art">
      <style>{`
        @keyframes vvFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes vvCheck { 0%{stroke-dashoffset:40} 60%{stroke-dashoffset:0} }
        .float1{animation:vvFloat 3.4s ease-in-out infinite}
        .float2{animation:vvFloat 4.2s ease-in-out infinite .4s}
        .chk{stroke-dasharray:40;animation:vvCheck 1.6s ease .6s infinite}
      `}</style>
      <g className="float1">
        <rect x="28" y="34" width="92" height="46" rx="8" fill="#4A2368" />
        <path className="chk" d="M48 58l14 13 24-28" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M28 40l92 10" stroke="#fff" strokeOpacity=".25" strokeWidth="3" strokeDasharray="4 5" />
      </g>
      <g className="float2">
        <path d="M120 74a22 22 0 1 0 0 6" fill="none" stroke="#2E516B" strokeWidth="8" strokeLinecap="round" />
        <circle cx="126" cy="82" r="5" fill="#2E516B" />
      </g>
    </svg>
  )
}

export default function AdminHome() {
  const [events, setEvents] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listEvents()
      setEvents(data)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar eventos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const activeEvent = (events || []).find((e) => e.status === 'active')

  function openTerminal() {
    const ev = activeEvent || events?.[0]
    if (!ev) return
    useTerminalStore.getState().setEvent({ eventId: ev.id })
    navigate(`/terminal/${ev.id}`)
  }

  return (
    <div className="page">
      <TopBar crumb="Painel do administrador" />
      <div className="page-body">
        {error && <ErrorNotice>{error}</ErrorNotice>}

        <section className="hero">
          <div>
            <p className="hero-eyebrow">Painel do administrador</p>
            <h1 className="hero-title">Seus eventos, sob controle</h1>
            <p className="hero-sub">
              Crie e configure eventos, gerencie equipe, lotes, ingressos e acompanhe a operação em tempo real.
            </p>
          </div>
          <div className="hero-actions" style={{ alignItems: 'center' }}>
            <TicketHero />
            <Btn variant="primary" size="lg" onClick={() => navigate('/admin/eventos/novo')}>
              + Criar evento
            </Btn>
          </div>
        </section>

        {loading && <PageLoader />}

        {!loading && events && (
          <>
            {activeEvent && (
              <div className="card card-pad mb-4">
                <div className="card-head">
                  <h2 className="card-title">Evento em operação</h2>
                  <Btn variant="outline" className="btn-sm" onClick={openTerminal}>Abrir terminal →</Btn>
                </div>
                <EventCard event={activeEvent} />
              </div>
            )}

            <section>
              <div className="card-head">
                <h2 className="card-title">Eventos</h2>
                <button type="button" className="btn-ghost btn-sm" onClick={() => navigate('/admin/eventos')}>
                  Gerenciar todos →
                </button>
              </div>

              {events.length === 0 && (
                <div className="card"><EmptyState title="Nenhum evento ainda" sub="Crie seu primeiro evento para começar." /></div>
              )}

              <div className="grid grid-cols-2">
                {(events || []).slice(0, 6).map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
