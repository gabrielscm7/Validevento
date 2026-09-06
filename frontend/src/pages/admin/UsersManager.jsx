import { useCallback, useEffect, useState } from 'react'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice, EmptyState } from '../../components/feedback'
import { Modal, Btn } from '../../components/ui'
import { listUsers, createUser, updateUser, deactivateUser } from '../../services/usersService'
import { formatCPF, onlyDigits, ROLE_LABEL } from '../../lib/format'
import { useAuthStore } from '../../store/authStore'

const EMPTY = { name: '', cpf: '', email: '', role: 'validator' }

export default function UsersManager() {
  const { user: me } = useAuthStore()
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listUsers()
      setUsers(data)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar usuários.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const quotas = {
    admin: { used: (users || []).filter((u) => u.role === 'admin' && u.active).length },
    supervisor: { used: (users || []).filter((u) => u.role === 'supervisor' && u.active).length },
    validator: { used: (users || []).filter((u) => u.role === 'validator' && u.active).length },
  }

  async function handleInvite(e) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    setError('')
    try {
      await createUser({
        name: form.name,
        cpf: onlyDigits(form.cpf),
        email: form.email,
        role: form.role,
      })
      setMsg(`Convite enviado para ${form.email}`)
      setForm(EMPTY)
      setModal(false)
      await load()
    } catch (err) {
      const d = err?.response?.data
      const q = err?.response?.status === 422
      setError(q && d?.max != null
        ? `Cota de ${d.resource || 'usuários'} atingida (${d.used}/${d.max}).`
        : d?.details || d?.error || 'Erro ao convidar usuário.')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggle(u) {
    setBusy(true)
    setError('')
    try {
      if (u.active) {
        if (!window.confirm(`Desativar ${u.name}? O usuário perde o acesso imediatamente.`)) return
        await deactivateUser(u.id)
      } else {
        await updateUser(u.id, { active: true })
      }
      await load()
    } catch (e) {
      setError(e?.response?.data?.error || 'Falha ao alterar usuário.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return (<div className="page"><TopBar /><PageLoader /></div>)

  return (
    <div className="page">
      <TopBar crumb="Admin · Usuários" />
      <div className="page-body">
        {error && <ErrorNotice>{error}</ErrorNotice>}

        <section className="hero">
          <div>
            <p className="hero-eyebrow">Usuários</p>
            <h1 className="hero-title">Equipe do cliente</h1>
            <p className="hero-sub">Convide supervisores e validadores para operar seus eventos.</p>
          </div>
          <div className="hero-actions">
            <Btn variant="primary" size="lg" onClick={() => { setForm(EMPTY); setModal(true) }}>+ Convidar usuário</Btn>
          </div>
        </section>

        {/* Cotas usadas */}
        <div className="grid grid-cols-3 mb-4">
          {['admin', 'supervisor', 'validator'].map((role) => (
            <div key={role} className="card metric-card">
              <p className="metric-label">{ROLE_LABEL[role]}s</p>
              <p className="metric-value">{quotas[role].used}<span className="metric-sub" style={{ fontSize: 14 }}> ativos</span></p>
            </div>
          ))}
        </div>

        {users && users.length === 0 && (
          <div className="card"><EmptyState title="Nenhum usuário" sub="Convide a primeira pessoa da sua equipe." /></div>
        )}

        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>E-mail verificado</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {(users || []).map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium" style={{ color: 'var(--text-strong)' }}>
                      {u.name}
                      {u.id === me?.id && <span className="badge badge-blue ml-2">Você</span>}
                    </td>
                    <td>{u.email}</td>
                    <td><span className={`pill ${u.role === 'admin' ? 'pill-purple' : u.role === 'supervisor' ? 'pill-blue' : 'pill-gray'}`}>{ROLE_LABEL[u.role]}</span></td>
                    <td>{u.email_verified ? <span className="badge badge-green">Sim</span> : <span className="badge badge-yellow">Pendente</span>}</td>
                    <td>{u.active ? <span className="badge badge-green">Ativo</span> : <span className="badge badge-red">Desativado</span>}</td>
                    <td>
                      {u.id !== me?.id && (
                        <button type="button" className="btn-ghost btn-sm"
                          style={u.active ? { color: 'var(--danger)' } : undefined}
                          onClick={() => handleToggle(u)}>
                          {u.active ? 'Desativar' : 'Reativar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Convidar usuário"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn variant="primary" loading={busy} onClick={handleInvite}
              disabled={!form.name || !form.email || onlyDigits(form.cpf).length !== 11}>
              Enviar convite
            </Btn>
          </>
        }>
        {msg && <div className="form-success mb-3">{msg}</div>}
        <form onSubmit={handleInvite}>
          <div className="field">
            <label className="label">Nome completo *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">CPF *</label>
            <input className="input" inputMode="numeric" placeholder="000.000.000-00" value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })} />
          </div>
          <div className="field">
            <label className="label">E-mail *</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Perfil</label>
            <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="supervisor">Supervisor</option>
              <option value="validator">Validador</option>
            </select>
            <span className="hint">Somente o Master cria administradores.</span>
          </div>
        </form>
      </Modal>
    </div>
  )
}
