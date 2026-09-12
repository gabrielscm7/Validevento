import { useCallback, useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice, EmptyState } from '../../components/feedback'
import { Btn } from '../../components/ui'
import ImportTicketsModal from '../../components/admin/ImportTicketsModal'
import { getEvent } from '../../services/eventsService'
import { listEventBatches } from '../../services/eventsActionsService'
import {
  listTickets, blockTicket, unblockTicket, cancelInvitations, resetValidations,
} from '../../services/eventsActionsService'
import { formatDateTime } from '../../lib/format'

const ORIGIN_LABEL = {
  import: 'Importado',
  cortesia: 'Cortesia',
  liberacao_especial: 'Liberação especial',
  master: 'Master',
}

const STATUS_FILTERS = [
  ['', 'Todos'],
  ['active', 'Ativo'],
  ['validated', 'Validado'],
  ['blocked', 'Bloqueado'],
]

export default function TicketsManager() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [batches, setBatches] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  const [status, setStatus] = useState('')
  const [batch, setBatch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ev, bs] = await Promise.all([getEvent(id), listEventBatches(id)])
      setEvent(ev)
      setBatches(bs)
      const params = { page, limit: 50 }
      if (status) params.status = status
      if (batch) params.batch = batch
      const tickets = await listTickets(id, params)
      setData(tickets)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar ingressos.')
    } finally {
      setLoading(false)
    }
  }, [id, page, status, batch])

  useEffect(() => { load() }, [load])

  // Debounce simples da busca local (o backend não busca por nome, então
  // filtramos client-side quando há texto).
  const visibleData = data
    ? {
        ...data,
        data: data.data.filter((t) => {
          if (!q) return true
          const needle = q.toLowerCase()
          return (t.display_name || '').toLowerCase().includes(needle) ||
            (t.ticket_code || '').toLowerCase().includes(needle)
        }),
      }
    : null

  async function toggleBlock(t) {
    setBusyId(t.id)
    setError('')
    try {
      if (t.status === 'blocked') await unblockTicket(id, t.id)
      else {
        if (!window.confirm(`Bloquear o ingresso de "${t.display_name || t.ticket_code}"?`)) return
        await blockTicket(id, t.id)
      }
      await load()
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Falha ao alterar ingresso.')
    } finally {
      setBusyId(null)
    }
  }

  async function runAction(action, payload, message) {
    if (!window.confirm(message)) return
    setBusyId('bulk')
    setError('')
    try {
      if (action === 'cancel') await cancelInvitations(id, payload)
      else await resetValidations(id, payload)
      setSelectedIds([])
      await load()
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Não foi possível concluir a operação.')
    } finally {
      setBusyId(null)
    }
  }

  const visibleRows = visibleData?.data || []
  const generated = (t) => t.origin === 'cortesia' || t.origin === 'liberacao_especial'

  if (loading) return (<div className="page"><TopBar /><PageLoader /></div>)

  return (
    <div className="page">
      <TopBar crumb={`Admin · ${event?.name}`} eventName={event?.name} />
      <div className="page-body">
        <section className="hero">
          <div>
            <Link to={`/admin/eventos/${id}`} className="btn-text">← Evento</Link>
            <p className="hero-eyebrow mt-2">Ingressos</p>
            <h1 className="hero-title">Ingressos do evento</h1>
            <p className="hero-sub">{data?.total ?? 0} ingressos · página {data?.page || 1} de {data?.pages || 1}</p>
          </div>
          <div className="hero-actions">
            <Btn variant="outline" onClick={() => setImportOpen(true)}>Importar</Btn>
            <Btn variant="outline" onClick={() => navigate(`/admin/eventos/${id}/lotes`)}>Ver lotes</Btn>
            <Btn variant="ghost" loading={busyId === 'bulk'} onClick={() => runAction('cancel', { all_generated: true }, 'Cancelar todos os convites gerados deste evento?')}>Cancelar convites</Btn>
            <Btn variant="ghost" loading={busyId === 'bulk'} onClick={() => runAction('reset', { all: true }, 'Resetar todas as validações deste evento?')}>Resetar validações</Btn>
          </div>
        </section>

        {error && <ErrorNotice>{error}</ErrorNotice>}

        {/* Filtros */}
        <div className="card card-pad mb-4">
          <div className="grid grid-cols-3 gap-2" style={{ gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label">Status</label>
              <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
                {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label">Lote</label>
              <select className="select" value={batch} onChange={(e) => { setBatch(e.target.value); setPage(1) }}>
                <option value="">Todos</option>
                {batches.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label">Busca (código/nome)</label>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar…" />
            </div>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="card card-pad mb-4 flex gap-2 flex-wrap items-center">
            <span className="text-sm">{selectedIds.length} selecionado(s)</span>
            <Btn variant="ghost" loading={busyId === 'bulk'} onClick={() => runAction('cancel', { ticket_ids: selectedIds }, 'Cancelar os convites selecionados?')}>Cancelar selecionados</Btn>
            <Btn variant="outline" loading={busyId === 'bulk'} onClick={() => runAction('reset', { ticket_ids: selectedIds }, 'Resetar as validações selecionadas?')}>Resetar selecionados</Btn>
          </div>
        )}

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                  <tr>
                   <th aria-label="Selecionar" />
                  <th>Nome</th>
                  <th>Lote</th>
                  <th>Status</th>
                  <th>Origem</th>
                  <th>Validação</th>
                  <th>Ingresso</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                  {visibleRows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${t.display_name || t.ticket_code}`}
                        checked={selectedIds.includes(t.id)}
                        onChange={(e) => setSelectedIds((current) => e.target.checked
                          ? [...current, t.id]
                          : current.filter((value) => value !== t.id))}
                      />
                    </td>
                    <td className="font-medium" style={{ color: 'var(--text-strong)' }}>{t.display_name || '—'}</td>
                    <td>{t.batch}</td>
                    <td>
                      <span className={`badge ${
                         t.status === 'active' ? 'badge-green' : t.status === 'validated' ? 'badge-blue' : t.status === 'cancelled' ? 'badge-gray' : 'badge-red'
                      }`}>{t.status}</span>
                    </td>
                    <td><span className="pill pill-gray">{ORIGIN_LABEL[t.origin] || t.origin}</span></td>
                    <td className="text-xs text-muted">{formatDateTime(t.validated_at)}</td>
                    <td><span className="mono text-xs">{t.ticket_code?.slice(0, 8)}…</span></td>
                    <td>
                      {generated(t) && t.status !== 'cancelled' && (
                        <button type="button" className="btn-sm btn btn-ghost" style={{ color: 'var(--danger)' }}
                          disabled={busyId === t.id} onClick={() => runAction('cancel', { ticket_ids: [t.id] }, 'Cancelar este convite?')}>
                          Cancelar convite
                        </button>
                      )}
                      {t.status === 'validated' && (
                        <button type="button" className="btn-sm btn btn-outline" disabled={busyId === t.id}
                          onClick={() => runAction('reset', { ticket_ids: [t.id] }, 'Resetar a validação deste ingresso?')}>
                          Resetar validação
                        </button>
                      )}
                      {t.status !== 'cancelled' && t.status !== 'validated' && (
                        <button type="button" className={`btn-sm btn ${t.status === 'blocked' ? 'btn-outline' : 'btn-ghost'}`}
                          style={t.status !== 'blocked' ? { color: 'var(--danger)' } : undefined}
                          disabled={busyId === t.id} onClick={() => toggleBlock(t)}>
                          {t.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(!visibleData || visibleData.data.length === 0) && (
                   <tr><td colSpan={8}><EmptyState title="Nenhum ingresso" sub="Ajuste os filtros ou importe ingressos." /></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {(data?.pages || 1) > 1 && (
            <div className="card-pad flex items-center justify-between">
              <Btn variant="ghost" className="btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</Btn>
              <span className="text-sm text-muted">Página {page} de {data.pages}</span>
              <Btn variant="ghost" className="btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Próxima →</Btn>
            </div>
          )}
        </div>
      </div>

      <ImportTicketsModal event={event} open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
    </div>
  )
}
