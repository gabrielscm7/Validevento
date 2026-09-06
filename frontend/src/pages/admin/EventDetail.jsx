import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice } from '../../components/feedback'
import { Modal, Btn } from '../../components/ui'
import ImportTicketsModal from '../../components/admin/ImportTicketsModal'
import { getEvent, changeEventStatus } from '../../services/eventsService'
import { createInvitation } from '../../services/eventsActionsService'
import { formatDateTime, formatCPF } from '../../lib/format'
import { setLastEventId } from '../../lib/lastEvent'

export default function EventDetail() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({ display_name: '', cpf: '' })
  const [inviteResult, setInviteResult] = useState(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getEvent(id)
      setEvent(data)
      setLastEventId(data.id)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar evento.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleStatusChange(next) {
    if (!window.confirm(next === 'active'
      ? `Ativar o evento "${event.name}"? A operação será aberta.`
      : `Encerrar o evento "${event.name}"? Após encerrar, ele se torna imutável.`)) return
    setBusy(true)
    try {
      await changeEventStatus(id, next)
      await load()
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Falha ao alterar status.')
    } finally {
      setBusy(false)
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    setBusy(true)
    setInviteResult(null)
    try {
      const res = await createInvitation(id, {
        display_name: inviteForm.display_name,
        cpf: inviteForm.cpf ? inviteForm.cpf.replace(/\D/g, '') : undefined,
      })
      setInviteResult(res)
    } catch (err) {
      setError(err?.response?.data?.details || err?.response?.data?.error || 'Erro ao gerar convite.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return (<div className="page"><TopBar /><PageLoader /></div>)
  if (error && !event) return (<div className="page"><TopBar /><div className="page-body"><ErrorNotice>{error}</ErrorNotice></div></div>)

  const occupancy = event.capacity
    ? Math.min(100, Math.round(((event.validated_count || 0) / event.capacity) * 100))
    : 0

  return (
    <div className="page">
      <TopBar crumb="Admin · Eventos" eventName={event?.name} />
      <div className="page-body">
        {error && <ErrorNotice>{error}</ErrorNotice>}

        <section className="hero">
          <div>
            <Link to="/admin/eventos" className="btn-text">← Eventos</Link>
            <p className="hero-eyebrow mt-2">Evento</p>
            <h1 className="hero-title">{event?.name}</h1>
            <p className="hero-sub">
              {formatDateTime(event?.date)}
              {event?.location ? ` · ${event.location}` : ''}
              {event?.responsible?.length ? ` · Responsável(is): ${event.responsible.join(', ')}` : ''}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {event?.status === 'draft' && (
              <Btn variant="success" onClick={() => handleStatusChange('active')} loading={busy}>Ativar evento</Btn>
            )}
            {event?.status === 'active' && (
              <>
                <Btn variant="blue" onClick={() => navigate(`/supervisor/${event.id}`)}>Abrir dashboard</Btn>
                <Btn variant="ghost" style={{ color: 'var(--danger)' }} onClick={() => handleStatusChange('closed')} loading={busy}>Encerrar evento</Btn>
              </>
            )}
            <Btn variant="primary" onClick={() => navigate(`/admin/eventos/${id}/config`)}>Configurar</Btn>
            {event?.status !== 'closed' && (
              <Btn variant="outline" onClick={() => navigate(`/admin/eventos/${id}/editar`)}>Editar</Btn>
            )}
          </div>
        </section>

        {/* Métricas rápidas */}
        <div className="grid grid-cols-4 mb-4">
          <div className="card metric-card">
            <p className="metric-label">Ingressos</p>
            <p className="metric-value">{event?.tickets_count ?? 0}</p>
          </div>
          <div className="card metric-card">
            <p className="metric-label">Validados</p>
            <p className="metric-value">{event?.validated_count ?? 0}</p>
          </div>
          <div className="card metric-card">
            <p className="metric-label">Capacidade</p>
            <p className="metric-value">{event?.capacity ?? 0}</p>
          </div>
          <div className="card metric-card">
            <p className="metric-label">Ocupação</p>
            <p className="metric-value">{occupancy}%</p>
            <div className="progress mt-2"><div className="bar purple" style={{ width: `${occupancy}%` }} /></div>
          </div>
        </div>

        <div className="card card-pad mb-4">
          <div className="card-head">
            <h2 className="card-title">Gerência do evento</h2>
          </div>
          <div className="grid grid-cols-2" style={{ gap: 12 }}>
            {[
              ['Configurações de validação/check-in', `/admin/eventos/${id}/config`],
              ['Equipe designada', `/admin/eventos/${id}/equipe`],
              ['Lotes', `/admin/eventos/${id}/lotes`],
              ['Ingressos', `/admin/eventos/${id}/ingressos`],
            ].map(([label, to]) => (
              <Link key={to} to={to} className="entity-row">
                <span className="entity-avatar blue" style={{ width: 34, height: 34, fontSize: 15 }}>→</span>
                <span className="font-medium" style={{ color: 'var(--text-strong)' }}>{label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {event?.status !== 'closed' && (
            <>
              <Btn variant="outline" onClick={() => setImportOpen(true)}>Importar ingressos (CSV/XLSX)</Btn>
              <Btn variant="outline" onClick={() => { setInviteForm({ display_name: '', cpf: '' }); setInviteResult(null); setInviteOpen(true) }}>
                Gerar convite avulso
              </Btn>
            </>
          )}
          {event?.status === 'active' && (
            <Btn variant="blue" onClick={() => navigate(`/terminal/${event.id}`)}>Abrir terminal</Btn>
          )}
        </div>

        <ImportTicketsModal
          event={event}
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onDone={load}
        />

        <Modal open={inviteOpen} onClose={() => setInviteOpen(false)}
          title="Gerar convite avulso (cortesia)"
          footer={
            <>
              <Btn variant="ghost" onClick={() => setInviteOpen(false)}>Fechar</Btn>
              <Btn variant="primary" loading={busy} onClick={handleInvite} disabled={!inviteForm.display_name}>Gerar</Btn>
            </>
          }>
          <form onSubmit={handleInvite}>
            {inviteResult && (
              <div className="form-success mb-3">
                Convite gerado: <span className="mono">{inviteResult.ticket_code}</span>
                <p className="mt-2">O convite já está ativo e pode ser usado na portaria.</p>
              </div>
            )}
            <div className="field">
              <label className="label">Nome do convidado *</label>
              <input className="input" value={inviteForm.display_name}
                onChange={(e) => setInviteForm({ ...inviteForm, display_name: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">CPF (opcional)</label>
              <input className="input" inputMode="numeric" placeholder="000.000.000-00" value={inviteForm.cpf}
                onChange={(e) => setInviteForm({ ...inviteForm, cpf: formatCPF(e.target.value) })} />
            </div>
          </form>
        </Modal>

        {/* Portões atuais */}
        <div className="card card-pad">
          <div className="card-head">
            <h2 className="card-title">Portões</h2>
            <Link to={`/supervisor/${event.id}/portoes`} className="btn-ghost btn-sm">Gerenciar →</Link>
          </div>
          {(!event?.gates || event.gates.length === 0) && (
            <p className="card-sub">Nenhum portão criado ainda.</p>
          )}
          <div className="grid gap-sm mt-3">
            {(event?.gates || []).map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-strong)' }}>{g.name}</span>
                  {g.is_open ? (
                    <span className="badge badge-green ml-2">Aberto</span>
                  ) : (
                    <span className="badge badge-gray ml-2">Fechado</span>
                  )}
                </div>
                <span className="text-xs text-muted">
                  {g.opened_at ? `aberto ${formatDateTime(g.opened_at)}` : g.closed_at ? `fechado ${formatDateTime(g.closed_at)}` : 'sem movimentação'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
