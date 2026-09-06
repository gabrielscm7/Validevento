import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice, EmptyState } from '../../components/feedback'
import { Modal, Btn } from '../../components/ui'
import { getEvent } from '../../services/eventsService'
import { listGates, createGate, openGate, closeGate } from '../../services/eventsActionsService'
import { formatTimeSec } from '../../lib/format'

export default function GatesPanel() {
  const { eventId } = useParams()
  const [event, setEvent] = useState(null)
  const [gates, setGates] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [name, setName] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ev, g] = await Promise.all([getEvent(eventId), listGates(eventId)])
      setEvent(ev)
      setGates(g)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar portões.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!name.trim()) return
    setBusyId('new')
    setError('')
    try {
      await createGate(eventId, name.trim())
      setModal(false)
      setName('')
      await load()
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Erro ao criar portão.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggle(gate) {
    setBusyId(gate.id)
    setError('')
    try {
      if (gate.status === 'open') {
        if (!window.confirm(`Fechar o portão "${gate.name}"?`)) return
        await closeGate(eventId, gate.id)
      } else {
        await openGate(eventId, gate.id)
      }
      await load()
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Erro ao operar portão.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return (<div className="page"><TopBar /><PageLoader /></div>)

  return (
    <div className="page">
      <TopBar crumb={`Supervisor · ${event?.name}`} eventName={event?.name} onBack={() => window.history.back()} />
      <div className="page-body narrow">
        <section className="hero">
          <div>
            <Link to={`/supervisor/${eventId}`} className="btn-text">← Dashboard</Link>
            <p className="hero-eyebrow mt-2">Portões</p>
            <h1 className="hero-title">Controle de portões</h1>
            <p className="hero-sub">Abra e feche portões registrando timestamps para auditoria.</p>
          </div>
          <div className="hero-actions">
            <Btn variant="primary" onClick={() => { setName(''); setModal(true) }}>+ Novo portão</Btn>
          </div>
        </section>

        {error && <ErrorNotice>{error}</ErrorNotice>}

        {gates && gates.length === 0 && (
          <div className="card"><EmptyState title="Nenhum portão" sub="Crie o Portão Principal para começar a operar." /></div>
        )}

        <div className="grid">
          {(gates || []).map((g) => (
            <div key={g.id} className="entity-row" style={{ flexWrap: 'wrap' }}>
              <span className={`dot ${g.status === 'open' ? 'dot-green pulse' : 'dot-gray'}`} />
              <div className="flex-1" style={{ minWidth: 160 }}>
                <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>{g.name}</p>
                <p className="text-xs text-muted">
                  {g.status === 'open'
                    ? `Aberto ${formatTimeSec(g.opened_at)}${g.opened_by ? ` por ${g.opened_by}` : ''}`
                    : g.closed_at
                      ? `Fechado ${formatTimeSec(g.closed_at)}${g.closed_by ? ` por ${g.closed_by}` : ''}`
                      : 'Nunca aberto'}
                </p>
              </div>
              {g.status === 'open' ? (
                <Btn variant="ghost" className="btn-lg" style={{ color: 'var(--danger)', flex: 1, maxWidth: 260 }}
                  loading={busyId === g.id} onClick={() => handleToggle(g)}>
                  Fechar portão
                </Btn>
              ) : (
                <Btn variant="success" className="btn-lg" style={{ flex: 1, maxWidth: 260 }}
                  loading={busyId === g.id} onClick={() => handleToggle(g)}>
                  Abrir portão
                </Btn>
              )}
            </div>
          ))}
        </div>

        {/* Histórico do dia */}
        <div className="card card-pad mt-4">
          <h3 className="card-title mb-3">Movimentações registradas</h3>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {(gates || []).flatMap((g) => [
              ...(g.opened_at ? [{ g: g.name, action: 'Abertura', at: g.opened_at, by: g.opened_by }] : []),
              ...(g.closed_at ? [{ g: g.name, action: 'Fechamento', at: g.closed_at, by: g.closed_by }] : []),
            ]).sort((a, b) => new Date(b.at) - new Date(a.at)).map((m, i) => (
              <div key={i} className="feed-line">
                <span className={`badge ${m.action === 'Abertura' ? 'badge-green' : 'badge-red'}`}>{m.action}</span>
                <span className="font-medium" style={{ color: 'var(--text-strong)' }}>{m.g}</span>
                <span className="text-xs text-muted flex-1">{m.by ? `por ${m.by}` : ''}</span>
                <span className="text-xs text-muted">{formatTimeSec(m.at)}</span>
              </div>
            ))}
            {(!gates || gates.every((g) => !g.opened_at && !g.closed_at)) && (
              <p className="text-muted text-sm text-center py-4">Nenhuma movimentação hoje</p>
            )}
          </div>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Novo portão"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn variant="primary" loading={busyId === 'new'} onClick={handleCreate} disabled={!name.trim()}>Criar</Btn>
          </>
        }>
        <div className="field">
          <label className="label">Nome do portão</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Portão Principal" autoFocus />
        </div>
      </Modal>
    </div>
  )
}
