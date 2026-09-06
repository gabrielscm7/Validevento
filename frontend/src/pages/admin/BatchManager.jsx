import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice, EmptyState } from '../../components/feedback'
import { Modal, Btn } from '../../components/ui'
import ImportTicketsModal from '../../components/admin/ImportTicketsModal'
import { getEvent } from '../../services/eventsService'
import { listEventBatches, createEventBatch, updateEventBatch, deleteEventBatch } from '../../services/eventsActionsService'

export default function BatchManager() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [batches, setBatches] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [modal, setModal] = useState({ open: false, editing: null })
  const [form, setForm] = useState({ name: '', description: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ev, b] = await Promise.all([getEvent(id), listEventBatches(id)])
      setEvent(ev)
      setBatches(b)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar lotes.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    setBusy(true)
    setError('')
    try {
      if (modal.editing) await updateEventBatch(id, modal.editing.id, form)
      else await createEventBatch(id, form)
      setModal({ open: false, editing: null })
      await load()
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Erro ao salvar lote.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(batch) {
    if (!window.confirm(`Excluir o lote "${batch.name}"?`)) return
    setBusy(true)
    setError('')
    try {
      await deleteEventBatch(id, batch.id)
      await load()
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Erro ao excluir lote.')
    } finally {
      setBusy(false)
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
            <p className="hero-eyebrow mt-2">Lotes</p>
            <h1 className="hero-title">Lotes de ingressos</h1>
            <p className="hero-sub">Organize seus ingressos em lotes e acompanhe a ocupação.</p>
          </div>
          <div className="hero-actions flex-wrap">
            <Btn variant="outline" size="lg" onClick={() => setImportOpen(true)}>Importar ingressos</Btn>
            <Btn variant="primary" size="lg" onClick={() => { setForm({ name: '', description: '' }); setModal({ open: true, editing: null }) }}>+ Criar lote</Btn>
          </div>
        </section>

        {error && <ErrorNotice>{error}</ErrorNotice>}

        {batches && batches.length === 0 && (
          <div className="card"><EmptyState title="Nenhum lote" sub="Crie um lote ou importe ingressos para começar." /></div>
        )}

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th className="num">Gerados</th>
                  <th className="num">Validados</th>
                  <th>Ocupação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {(batches || []).map((b) => (
                  <tr key={b.id}>
                    <td>
                      <p className="font-medium" style={{ color: 'var(--text-strong)' }}>{b.name}</p>
                      {b.description && <p className="text-xs text-muted">{b.description}</p>}
                    </td>
                    <td className="num">{b.qtd_gerada}</td>
                    <td className="num">{b.qtd_validada}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="progress flex-1" style={{ minWidth: 80 }}>
                          <div className="bar purple" style={{ width: `${b.occupancy_percent || 0}%` }} />
                        </div>
                        <span className="text-xs text-muted">{b.occupancy_percent || 0}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button type="button" className="btn-ghost btn-sm"
                          onClick={() => { setForm({ name: b.name, description: b.description || '' }); setModal({ open: true, editing: b }) }}>
                          Editar
                        </button>
                        <button type="button" className="btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                          onClick={() => handleDelete(b)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ImportTicketsModal event={event} open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />

      <Modal open={modal.open} onClose={() => setModal({ open: false, editing: null })}
        title={modal.editing ? 'Editar lote' : 'Novo lote'}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal({ open: false, editing: null })}>Cancelar</Btn>
            <Btn variant="primary" loading={busy} onClick={handleSave} disabled={!form.name}>Salvar</Btn>
          </>
        }>
        <div className="field">
          <label className="label">Nome *</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="LOTE-01" />
        </div>
        <div className="field">
          <label className="label">Descrição</label>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Modal>
    </div>
  )
}
