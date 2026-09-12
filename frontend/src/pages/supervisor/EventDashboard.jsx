import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice } from '../../components/feedback'
import { Modal, Btn } from '../../components/ui'
import { useAuthStore } from '../../store/authStore'
import { getEvent, changeEventStatus as changeEventStatusApi } from '../../services/eventsService'
import { getConfig, toggleCheckoutApi } from '../../services/eventsActionsService'
import { useDashboardData } from '../../hooks/useDashboardData'
import { SummaryCards } from '../../components/dashboard/SummaryCards'
import { EntryChart } from '../../components/dashboard/EntryChart'
import { BatchTable } from '../../components/dashboard/BatchTable'
import { GateTable } from '../../components/dashboard/GateTable'
import { TerminalsStatus } from '../../components/dashboard/TerminalsStatus'
import { LiveFeed } from '../../components/dashboard/LiveFeed'
import { AlertsFeed } from '../../components/dashboard/AlertsFeed'
import { formatDateTime } from '../../lib/format'
import { setLastEventId } from '../../lib/lastEvent'
import EventShareCard from '../../components/EventShareCard'

function EventHeader({ event, config, onToggleCheckout, onActivate, canActivate, statusBusy }) {
  const gateStatus = event?.gate_status
  return (
    <div className="card card-pad mb-4">
      {event?.banner_url && (
        <div style={{ margin: -18, marginBottom: 14, borderRadius: '14px 14px 0 0', overflow: 'hidden' }}>
          <img src={event.banner_url} alt="Banner do evento" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
          {event?.logo_url ? (
            <img src={event.logo_url} alt="Logo do evento" style={{ height: 44, maxWidth: 120, objectFit: 'contain' }} />
          ) : (
            <span className="brand-mark">🎟</span>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 className="card-title" style={{ fontSize: 20 }}>{event?.name}</h1>
            <p className="card-sub truncate">
              {formatDateTime(event?.date)}
              {event?.location ? ` · ${event.location}` : ''}
            </p>
            {event?.status === 'draft' && <span className="badge badge-gray mt-1">Rascunho — ainda não liberado</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {canActivate && (
            <Btn variant="success" className="btn-lg" loading={statusBusy} onClick={onActivate}>
              ▶ Ativar evento (liberar validações)
            </Btn>
          )}
          {event?.status === 'active' && (
            <div className="flex items-center gap-2">
              <span className="dot dot-green pulse" />
              <p className="text-sm font-medium" style={{ color: 'var(--text-strong)' }}>Operação aberta</p>
            </div>
          )}
          {event?.status === 'active' && (
            <Link to={`/terminal/${event.id}`} className="btn-primary btn-sm btn">Abrir terminal →</Link>
          )}
          <div className="flex items-center gap-2">
            <span className={`dot ${gateStatus?.status === 'open' ? 'dot-green pulse' : 'dot-gray'}`} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-strong)' }}>
                Portão {gateStatus?.status === 'open' ? 'aberto' : 'fechado'}
              </p>
              <p className="text-xs text-muted">
                {gateStatus?.opened_at ? `aberto às ${new Date(gateStatus.opened_at).toLocaleTimeString('pt-BR')}` : 'sem abertura hoje'}
              </p>
            </div>
          </div>
          <Link to="portoes" className="btn-outline btn-sm btn">Portões</Link>
          <Link to="relatorio" className="btn-outline btn-sm btn">Relatório</Link>
          {event?.status === 'active' && (
            <Btn variant="outline" className="btn-sm" onClick={onToggleCheckout}>
              Checkout: {config?.checkout_enabled ? 'ATIVO' : 'inativo'}
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EventDashboard() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [event, setEvent] = useState(null)
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [busy, setBusy] = useState(false)

  const dash = useDashboardData(event && event.status === 'active' ? eventId : null)

  const loadEvent = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ev, cfg] = await Promise.all([getEvent(eventId), getConfig(eventId)])
      setEvent(ev)
      setConfig(cfg)
      setLastEventId(ev.id)
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.message || e?.response?.data?.error || 'Erro ao carregar evento.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { loadEvent() }, [loadEvent])

  const canActivate = user?.role === 'admin' && event?.status === 'draft'

  async function handleActivate() {
    if (!event) return
    if (!window.confirm(`Ativar o evento "${event.name}"? A operação será aberta e os validadores poderão liberar entradas.`)) return
    setStatusBusy(true)
    setError('')
    try {
      await changeEventStatusApi(eventId, 'active')
      await loadEvent()
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Falha ao ativar o evento.')
    } finally {
      setStatusBusy(false)
    }
  }

  async function handleToggleCheckout(confirmed) {
    if (!confirmed) { setConfirmOpen(true); return }
    setConfirmOpen(false)
    setBusy(true)
    setError('')
    try {
      const next = !config?.checkout_enabled
      const cfg = await toggleCheckoutApi(eventId, next)
      setConfig(cfg)
      dash.reload()
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Erro ao alterar checkout.')
    } finally {
      setBusy(false)
    }
  }

  async function handleForceSync() {
    setBusy(true)
    setError('')
    try {
      // Dispara um heartbeat global não existe; forçamos reload dos terminais.
      await dash.reload()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return (<div className="page"><TopBar crumb="Dashboard" /><PageLoader /></div>)

  if (!event && error) {
    return (
      <div className="page">
        <TopBar crumb="Dashboard" onBack={() => navigate('/admin')} />
        <div className="page-body narrow" style={{ paddingTop: 40 }}>
          <ErrorNotice>
            {error === 'not_in_event_team'
              ? 'Acesso negado: você não faz parte da equipe deste evento. Peça ao administrador para liberar seu acesso na tela Equipe.'
              : error}
          </ErrorNotice>
          <div className="mt-4">
            <Btn variant="primary" onClick={() => navigate('/admin')}>← Voltar aos eventos</Btn>
          </div>
        </div>
      </div>
    )
  }

  const speed = dash.data?.speed
  const isActive = event?.status === 'active'

  return (
    <div className="page">
      <TopBar crumb="Supervisor · Dashboard" eventName={event?.name}
        onBack={() => navigate('/admin')} />
      <div className="page-body">
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {dash.error && <ErrorNotice>{dash.error}</ErrorNotice>}

        <EventHeader event={event} config={config}
          onToggleCheckout={handleToggleCheckout}
          onActivate={handleActivate}
          canActivate={canActivate}
          statusBusy={statusBusy} />

        {!isActive ? (
          <div className="card card-pad">
            <p className="card-title">Evento ainda não liberado</p>
            <p className="card-sub">
              {canActivate
                ? 'Clique em "Ativar evento" acima para liberar as validações nos terminais.'
                : 'Aguarde o administrador ativar o evento para liberar as validações.'}
            </p>
          </div>
        ) : (
          <>
            <SummaryCards data={dash.data?.summary} loading={dash.loading} />

            {speed && (
              <div className="grid grid-cols-4 gap-sm mt-4">
                <div className="card metric-card">
                  <p className="metric-label">Velocidade média</p>
                  <p className="metric-value">{speed.avg_gap_seconds ?? '—'}s</p>
                </div>
                <div className="card metric-card">
                  <p className="metric-label">Pico de fluxo</p>
                  <p className="metric-value">{speed.peak_hour || '—'}</p>
                  <p className="metric-sub">{speed.peak_count ?? 0} entradas</p>
                </div>
                <div className="card metric-card">
                  <p className="metric-label">Meta</p>
                  <p className="metric-value">{speed.target_seconds ?? '—'}s</p>
                </div>
                <div className="card metric-card">
                  <p className="metric-label">Dentro da meta</p>
                  <p className="metric-value">{speed.within_target_pct != null ? `${speed.within_target_pct}%` : '—'}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 mt-4">
              <EntryChart data={dash.data?.flow} loading={dash.loading} />
              <BatchTable data={dash.data?.batches} loading={dash.loading} />
            </div>

            <div className="mt-4">
              <GateTable data={dash.data?.gates} loading={dash.loading} />
            </div>

            <div className="grid grid-cols-2 mt-4">
              <AlertsFeed data={dash.data?.alerts} loading={dash.loading} />
              <LiveFeed data={dash.data?.liveFeed} loading={dash.loading} />
            </div>

            <div className="mt-4">
              <TerminalsStatus data={dash.data?.terminals} loading={dash.loading} />
            </div>

            <div className="mt-4">
              <EventShareCard event={event} canShare={user?.role === 'admin' || user?.role === 'master'} />
            </div>

            <div className="action-bar">
              <div className="flex items-center justify-between flex-wrap gap-2" style={{ padding: '0 2px' }}>
                <div className="flex gap-2 flex-wrap">
                  <Btn variant="outline" className="btn-sm" loading={busy} onClick={handleForceSync}>
                    ↻ Sincronizar terminais
                  </Btn>
                  <Link to="relatorio" className="btn-primary btn-sm btn">Exportar relatório</Link>
                </div>
                <span className="text-xs text-muted">Atualização automática a cada 30s</span>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)}
        title={config?.checkout_enabled ? 'Desativar checkout' : 'Ativar checkout'}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirmOpen(false)}>Cancelar</Btn>
            <Btn variant="primary" loading={busy} onClick={() => handleToggleCheckout(true)}>
              Confirmar
            </Btn>
          </>
        }>
        <p className="text-sm">
          {config?.checkout_enabled
            ? 'Ao desativar o checkout, os terminais deixam de registrar saídas. Deseja continuar?'
            : 'Ao ativar o checkout, os terminais passam a registrar saídas e permitir reentrada condicionada.'}
        </p>
      </Modal>
    </div>
  )
}
