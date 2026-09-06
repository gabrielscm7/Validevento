import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice, EmptyState } from '../../components/feedback'
import { Modal, Btn } from '../../components/ui'
import { useAuthStore } from '../../store/authStore'
import { createUser } from '../../services/usersService'
import { formatCPF, onlyDigits } from '../../lib/format'
import {
  listClients, createClient, updateClient, suspendClient, activateClient,
} from '../../services/clientsService'

const EMPTY = {
  name: '', cnpj: '', email: '', plan: 'basic',
  max_admins: 2, max_supervisors: 5, max_validators: 10,
  max_tickets_per_event: 3000, max_events_active: 1,
}
const PLANS = [
  { value: 'basic', label: 'Basic' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

export default function ClientsManager() {
  const [clients, setClients] = useState(null)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modal, setModal] = useState({ open: false, editing: null })
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  // Modal auxiliar para criar um admin do cliente
  const [invite, setInvite] = useState({ open: false, client: null })
  const [inviteForm, setInviteForm] = useState({ name: '', cpf: '', email: '' })
  const [inviteMsg, setInviteMsg] = useState('')
  const [inviting, setInviting] = useState(false)

  const navigate = useNavigate()
  const { user } = useAuthStore()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listClients()
      setClients(data)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar clientes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = (clients || []).filter((c) =>
    filter === 'all' ? true : filter === 'active' ? c.active : !c.active
  )

  function openCreate() {
    setForm(EMPTY)
    setModal({ open: true, editing: null })
  }

  function openEdit(client) {
    setForm({
      name: client.name, cnpj: client.cnpj || '', email: client.email, plan: client.plan,
      max_admins: client.max_admins, max_supervisors: client.max_supervisors,
      max_validators: client.max_validators,
      max_tickets_per_event: client.max_tickets_per_event,
      max_events_active: client.max_events_active,
    })
    setModal({ open: true, editing: client })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name, cnpj: form.cnpj, email: form.email, plan: form.plan,
        max_admins: Number(form.max_admins), max_supervisors: Number(form.max_supervisors),
        max_validators: Number(form.max_validators),
        max_tickets_per_event: Number(form.max_tickets_per_event),
        max_events_active: Number(form.max_events_active),
      }
      if (modal.editing) await updateClient(modal.editing.id, payload)
      else await createClient(payload)
      setModal({ open: false, editing: null })
      await load()
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao salvar cliente.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(client) {
    try {
      if (client.active) {
        if (!window.confirm(`Suspender "${client.name}"? Todos os usuários perdem o acesso.`)) return
        await suspendClient(client.id)
      } else {
        await activateClient(client.id)
      }
      await load()
    } catch (e) {
      setError(e?.response?.data?.error || 'Falha ao alterar cliente.')
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (!invite.client) return
    setInviting(true)
    setInviteMsg('')
    try {
      await createUser({
        name: inviteForm.name,
        cpf: onlyDigits(inviteForm.cpf),
        email: inviteForm.email,
        role: 'admin',
        tenant_id: invite.client.id,
      })
      setInviteForm({ name: '', cpf: '', email: '' })
      setInviteMsg(`Convite enviado para ${inviteForm.email}`)
    } catch (err) {
      const d = err?.response?.data
      setInviteMsg(d?.details || d?.error || 'Erro ao convidar usuário.')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="page">
      <TopBar crumb="Master · Clientes" />
      <div className="page-body">
        {error && <ErrorNotice>{error}</ErrorNotice>}

        <section className="hero">
          <div>
            <p className="hero-eyebrow">Clientes</p>
            <h1 className="hero-title">Gestão de clientes</h1>
            <p className="hero-sub">Cadastre clientes, defina cotas e gerencie o acesso da plataforma.</p>
          </div>
          <div className="hero-actions">
            <Btn variant="primary" size="lg" onClick={openCreate}>+ Novo cliente</Btn>
          </div>
        </section>

        <div className="flex gap-2 mb-4 flex-wrap">
          {[{ k: 'all', l: 'Todos' }, { k: 'active', l: 'Ativos' }, { k: 'suspended', l: 'Suspensos' }].map((f) => (
            <button key={f.k} type="button"
              className={`btn ${filter === f.k ? 'btn-primary' : 'btn-outline'} btn-sm`}
              onClick={() => setFilter(f.k)}>
              {f.l}
            </button>
          ))}
        </div>

        {loading && <PageLoader />}

        {!loading && visible.length === 0 && (
          <div className="card"><EmptyState title="Nenhum cliente" sub="Crie o primeiro cliente da plataforma." /></div>
        )}

        <div className="grid gap-sm">
          {(visible || []).map((c) => (
            <div key={c.id} className="entity-row">
              <span className={`dot ${c.active ? 'dot-green pulse' : 'dot-gray'}`} title={c.active ? 'Ativo' : 'Suspenso'} />
              <div className="flex-1" style={{ minWidth: 0 }}>
                <p className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                  <button type="button" className="btn-text" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)' }} onClick={() => navigate(`/master/clientes/${c.id}`)}>
                    {c.name}
                  </button>
                </p>
                <p className="text-xs text-muted truncate">
                  {c.email}
                  {c.cnpj ? ` · CNPJ ${c.cnpj}` : ''} · cotas: {c.max_admins} adm · {c.max_supervisors} sup · {c.max_validators} val · {c.max_tickets_per_event} ing/evento
                </p>
              </div>

              <span className={`pill ${c.active ? 'pill-green' : 'pill-gray'}`}>
                {c.active ? 'Ativo' : 'Suspenso'}
              </span>
              <span className="pill pill-purple">{c.plan}</span>

              <div className="flex gap-2 flex-wrap" style={{ justifyContent: 'flex-end' }}>
                <Btn variant="ghost" className="btn-sm" onClick={() => { setInviteMsg(''); setInviteForm({ name: '', cpf: '', email: '' }); setInvite({ open: true, client: c }) }}>
                  Convidar admin
                </Btn>
                <Btn variant="outline" className="btn-sm" onClick={() => openEdit(c)}>Editar cotas</Btn>
                <Btn variant={c.active ? 'ghost' : 'outline'} className="btn-sm"
                  style={c.active ? { color: 'var(--danger)' } : undefined}
                  onClick={() => handleToggle(c)}>
                  {c.active ? 'Suspender' : 'Ativar'}
                </Btn>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal criar/editar cliente */}
      <Modal open={modal.open} onClose={() => setModal({ open: false, editing: null })} title={modal.editing ? 'Editar cliente' : 'Novo cliente'} wide
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal({ open: false, editing: null })}>Cancelar</Btn>
            <Btn variant="primary" loading={saving} onClick={handleSave} disabled={!form.name || !form.email}>Salvar</Btn>
          </>
        }>
        <div className="grid grid-cols-2">
          <div className="field">
            <label className="label">Nome *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">CNPJ</label>
            <input className="input" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">E-mail *</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Plano</label>
            <select className="select" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              {PLANS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>
        <h4 className="font-semibold mb-1" style={{ color: 'var(--text-strong)' }}>Cotas</h4>
        <div className="grid grid-cols-2">
          {[
            ['max_admins', 'Máx. admins'],
            ['max_supervisors', 'Máx. supervisores'],
            ['max_validators', 'Máx. validadores'],
            ['max_tickets_per_event', 'Ingressos por evento'],
            ['max_events_active', 'Eventos simultâneos'],
          ].map(([key, label]) => (
            <div className="field" key={key}>
              <label className="label">{label}</label>
              <input type="number" min={1} className="input" value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </div>
          ))}
        </div>
      </Modal>

      {/* Modal convidar admin do cliente */}
      <Modal open={invite.open} onClose={() => setInvite({ open: false, client: null })}
        title={invite.client ? `Convidar admin — ${invite.client.name}` : 'Convidar admin'}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setInvite({ open: false, client: null })}>Fechar</Btn>
            <Btn variant="primary" loading={inviting} onClick={handleInvite} disabled={!inviteForm.name || !inviteForm.email || onlyDigits(inviteForm.cpf).length !== 11}>
              Enviar convite
            </Btn>
          </>
        }>
        {inviteMsg && (
          <div className={`${inviteMsg.startsWith('Convite') ? 'form-success' : 'form-error'}`}>{inviteMsg}</div>
        )}
        {user?.role === 'master' ? (
          <form onSubmit={handleInvite}>
            <div className="field">
              <label className="label">Nome completo *</label>
              <input className="input" value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">CPF *</label>
              <input className="input" inputMode="numeric" placeholder="000.000.000-00" value={inviteForm.cpf}
                onChange={(e) => setInviteForm({ ...inviteForm, cpf: formatCPF(e.target.value) })} />
            </div>
            <div className="field">
              <label className="label">E-mail *</label>
              <input type="email" className="input" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} />
            </div>
          </form>
        ) : (
          <p className="text-muted text-sm">Somente o Master pode criar administradores.</p>
        )}
      </Modal>
    </div>
  )
}
