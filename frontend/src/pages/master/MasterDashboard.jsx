import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice } from '../../components/feedback'
import { Modal, Btn } from '../../components/ui'
import { ClientRow } from '../../components/master/ClientRow'
import {
  listClients, createClient, updateClient, getClientUsage,
} from '../../services/clientsService'
import { listEvents } from '../../services/eventsService'
import { listUsers } from '../../services/usersService'

const PLANS = ['basic', 'pro', 'enterprise']
const PLAN_LABEL = { basic: 'Basic', pro: 'Pro', enterprise: 'Enterprise' }

function AnimatedOrbit() {
  return (
    <svg width="150" height="110" viewBox="0 0 150 110" aria-hidden="true">
      <style>{`
        @keyframes vvOrbit { to { transform: rotate(360deg); } }
        .o1 { animation: vvOrbit 9s linear infinite; transform-origin: 75px 55px; }
        .o2 { animation: vvOrbit 13s linear infinite reverse; transform-origin: 75px 55px; }
        .o3 { animation: vvOrbit 7s linear infinite; transform-origin: 75px 55px; }
      `}</style>
      <g className="o1">
        <circle cx="75" cy="14" r="6" fill="#7c4fa0" opacity=".8" />
      </g>
      <g className="o2">
        <circle cx="20" cy="88" r="5" fill="#2E516B" opacity=".85" />
      </g>
      <g className="o3">
        <circle cx="130" cy="86" r="7" fill="#4A2368" opacity=".7" />
      </g>
      <circle cx="75" cy="55" r="14" fill="#4A2368" />
      <circle cx="75" cy="55" r="20" fill="none" stroke="#c9b8dc" strokeWidth="1" strokeDasharray="3 4" />
    </svg>
  )
}

const EMPTY_FORM = {
  name: '', cnpj: '', email: '', plan: 'basic',
  max_admins: 2, max_supervisors: 5, max_validators: 10,
  max_tickets_per_event: 3000, max_events_active: 1,
}

export default function MasterDashboard() {
  const [clients, setClients] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listClients()
      setClients(data)

      // Métricas agregadas reais.
      const [events, users] = await Promise.all([
        listEvents(),
        listUsers(),
      ])
      const usageAll = await Promise.all(data.map((c) => getClientUsage(c.id).catch(() => null)))
      const ticketsMonth = usageAll.reduce((acc, u) => acc + (u?.tickets_this_month?.used || 0), 0)
      const usersActive = users.filter((u) => u.active).length
      setMetrics({
        activeClients: data.filter((c) => c.active).length,
        eventsActive: events.filter((e) => e.status === 'active').length,
        ticketsMonth,
        usersActive,
      })
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar clientes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name,
        cnpj: form.cnpj,
        email: form.email,
        plan: form.plan,
        max_admins: Number(form.max_admins),
        max_supervisors: Number(form.max_supervisors),
        max_validators: Number(form.max_validators),
        max_tickets_per_event: Number(form.max_tickets_per_event),
        max_events_active: Number(form.max_events_active),
      }
      if (form.id) await updateClient(form.id, payload)
      else await createClient(payload)
      setModalOpen(false)
      setForm(EMPTY_FORM)
      await load()
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao salvar cliente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <TopBar crumb="Painel master" />
      <div className="page-body">
        {error && <ErrorNotice>{error}</ErrorNotice>}

        <section className="hero">
          <div>
            <p className="hero-eyebrow">Painel master</p>
            <h1 className="hero-title">Gestão central do sistema</h1>
            <p className="hero-sub">
              Clientes, cotas e operação da plataforma Validevento em um só lugar.
            </p>
          </div>
          <div className="hero-actions">
            <AnimatedOrbit />
            <Btn variant="primary" size="lg" onClick={() => { setError(''); setForm(EMPTY_FORM); setModalOpen(true) }}>
              + Novo cliente
            </Btn>
          </div>
        </section>

        {loading && <PageLoader />}

        {metrics && !loading && (
          <div className="grid grid-cols-4 mb-4">
            <div className="card metric-card">
              <p className="metric-label">Clientes ativos</p>
              <p className="metric-value">{metrics.activeClients}</p>
            </div>
            <div className="card metric-card">
              <p className="metric-label">Eventos em curso</p>
              <p className="metric-value">{metrics.eventsActive}</p>
            </div>
            <div className="card metric-card">
              <p className="metric-label">Ingressos este mês</p>
              <p className="metric-value">{metrics.ticketsMonth}</p>
            </div>
            <div className="card metric-card">
              <p className="metric-label">Usuários ativos</p>
              <p className="metric-value">{metrics.usersActive}</p>
            </div>
          </div>
        )}

        <section>
          <div className="card-head">
            <h2 className="card-title">Clientes</h2>
            <Link to="/master/clientes" className="btn-ghost btn-sm">Ver todos →</Link>
          </div>

          {!loading && clients && clients.length === 0 && (
            <div className="card card-pad">
              <p className="empty-title">Nenhum cliente cadastrado</p>
              <p className="empty-sub mt-2">Clique em “Novo cliente” para começar.</p>
            </div>
          )}

          <div className="grid gap-sm">
            {(clients || []).slice(0, 8).map((c) => (
              <ClientRow key={c.id} client={c} onClick={() => navigate(`/master/clientes/${c.id}`)} />
            ))}
          </div>
        </section>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'Editar cliente' : 'Novo cliente'}
        wide
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Btn>
            <Btn variant="primary" loading={saving} onClick={handleSave} disabled={!form.name || !form.email}>
              Salvar cliente
            </Btn>
          </>
        }
      >
        <div className="grid grid-cols-2">
          <div className="field">
            <label className="label">Nome da empresa *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">CNPJ</label>
            <input className="input" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
          </div>
          <div className="field">
            <label className="label">E-mail de contato *</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Plano</label>
            <select className="select" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
            </select>
          </div>
        </div>

        <h4 className="mt-4 mb-1 font-semibold" style={{ color: 'var(--text-strong)' }}>Cotas</h4>
        <div className="grid grid-cols-2">
          <div className="field">
            <label className="label">Máx. admins</label>
            <input type="number" min={1} className="input" value={form.max_admins} onChange={(e) => setForm({ ...form, max_admins: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Máx. supervisores</label>
            <input type="number" min={1} className="input" value={form.max_supervisors} onChange={(e) => setForm({ ...form, max_supervisors: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Máx. validadores</label>
            <input type="number" min={1} className="input" value={form.max_validators} onChange={(e) => setForm({ ...form, max_validators: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Ingressos por evento</label>
            <input type="number" min={1} className="input" value={form.max_tickets_per_event} onChange={(e) => setForm({ ...form, max_tickets_per_event: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Eventos simultâneos</label>
            <input type="number" min={1} className="input" value={form.max_events_active} onChange={(e) => setForm({ ...form, max_events_active: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
