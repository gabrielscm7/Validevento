import { useCallback, useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice, EmptyState } from '../../components/feedback'
import { Btn } from '../../components/ui'
import ImportTicketsModal from '../../components/admin/ImportTicketsModal'
import { getEvent } from '../../services/eventsService'
import { listEventBatches } from '../../services/eventsActionsService'
import { listTickets, blockTicket, unblockTicket } from '../../services/eventsActionsService'
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

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
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
                {(visibleData?.data || []).map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium" style={{ color: 'var(--text-strong)' }}>{t.display_name || '—'}</td>
                    <td>{t.batch}</td>
                    <td>
                      <span className={`badge ${
                        t.status === 'active' ? 'badge-green' : t.status === 'validated' ? 'badge-blue' : 'badge-red'
                      }`}>{t.status}</span>
                    </td>
                    <td><span className="pill pill-gray">{ORIGIN_LABEL[t.origin] || t.origin}</span></td>
                    <td className="text-xs text-muted">{formatDateTime(t.validated_at)}</td>
                    <td><span className="mono text-xs">{t.ticket_code?.slice(0, 8)}…</span></td>
                    <td>
                      <button type="button" className={`btn-sm btn ${t.status === 'blocked' ? 'btn-outline' : 'btn-ghost'}`}
                        style={t.status !== 'blocked' ? { color: 'var(--danger)' } : undefined}
                        disabled={busyId === t.id}
                        onClick={() => toggleBlock(t)}>
                        {t.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                      </button>
                    </td>
                  </tr>
                ))}
                {(!visibleData || visibleData.data.length === 0) && (
                  <tr><td colSpan={7}><EmptyState title="Nenhum ingresso" sub="Ajuste os filtros ou importe ingressos." /></td></tr>
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
