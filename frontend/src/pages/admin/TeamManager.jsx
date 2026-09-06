import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice, EmptyState } from '../../components/feedback'
import { Modal, Btn } from '../../components/ui'
import { getEvent } from '../../services/eventsService'
import { listTeam, addTeamMember, removeTeamMember } from '../../services/eventsActionsService'
import { listUsers } from '../../services/usersService'
import { ROLE_LABEL } from '../../lib/format'

export default function TeamManager() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [team, setTeam] = useState(null)
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [selected, setSelected] = useState('')
  const [override, setOverride] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ev, t, u] = await Promise.all([getEvent(id), listTeam(id), listUsers()])
      setEvent(ev)
      setTeam(t)
      setUsers(u)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar equipe.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const memberIds = new Set((team || []).map((m) => m.id))
  const candidates = (users || []).filter((u) => u.active && !memberIds.has(u.id))

  async function handleAdd() {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      await addTeamMember(id, selected, override || null)
      setModal(false)
      setSelected('')
      setOverride('')
      await load()
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Erro ao adicionar.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(userId, name) {
    if (!window.confirm(`Remover ${name} da equipe do evento?`)) return
    setBusy(true)
    setError('')
    try {
      await removeTeamMember(id, userId)
      await load()
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Erro ao remover.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return (<div className="page"><TopBar /><PageLoader /></div>)

  return (
    <div className="page">
      <TopBar crumb={`Admin · ${event?.name}`} eventName={event?.name} />
      <div className="page-body narrow">
        <section className="hero">
          <div>
            <Link to={`/admin/eventos/${id}`} className="btn-text">← Evento</Link>
            <p className="hero-eyebrow mt-2">Equipe</p>
            <h1 className="hero-title">Equipe do evento</h1>
            <p className="hero-sub">Supervisores e validadores que atuam neste evento.</p>
          </div>
          <div className="hero-actions">
            <Btn variant="primary" onClick={() => { setSelected(''); setOverride(''); setModal(true) }}>+ Adicionar usuário</Btn>
          </div>
        </section>

        {error && <ErrorNotice>{error}</ErrorNotice>}

        {team && team.length === 0 && (
          <div className="card"><EmptyState title="Equipe vazia" sub="Adicione usuários do seu cliente para operar o evento." /></div>
        )}

        <div className="grid gap-sm">
          {(team || []).map((m) => (
            <div key={m.id} className="entity-row">
              <span className="entity-avatar">{m.name?.slice(0, 1)}</span>
              <div className="flex-1" style={{ minWidth: 0 }}>
                <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>{m.name}</p>
                <p className="text-xs text-muted truncate">{m.email}</p>
              </div>
              <span className={`pill ${(m.role_override || m.role) === 'admin' ? 'pill-purple' : (m.role_override || m.role) === 'supervisor' ? 'pill-blue' : 'pill-gray'}`}>
                {ROLE_LABEL[m.role_override || m.role]}
              </span>
              <button type="button" className="btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                onClick={() => handleRemove(m.id, m.name)}>
                Remover
              </button>
            </div>
          ))}
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Adicionar usuário ao evento"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn variant="primary" loading={busy} onClick={handleAdd} disabled={!selected}>Adicionar</Btn>
          </>
        }>
        <div className="field">
          <label className="label">Usuário (do seu cliente)</label>
          <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Selecione…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}</option>
            ))}
          </select>
          {candidates.length === 0 && <span className="hint">Todos os usuários ativos já fazem parte da equipe.</span>}
        </div>
        <div className="field">
          <label className="label">Perfil neste evento (override)</label>
          <select className="select" value={override} onChange={(e) => setOverride(e.target.value)}>
            <option value="">Manter perfil do usuário</option>
            <option value="supervisor">Supervisor</option>
            <option value="validator">Validador</option>
          </select>
        </div>
      </Modal>
    </div>
  )
}
