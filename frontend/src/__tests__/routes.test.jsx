import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { useAuthStore } from '../store/authStore'
import { useScopeStore } from '../store/scopeStore'
import { resolveNav, eventIdFromPath } from '../lib/nav'

// ── Serviços: nunca acessa a rede ───────────────────────────
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}))

vi.mock('../services/clientsService', () => ({
  listClients: vi.fn(() => Promise.resolve([])),
  getClient: vi.fn(() => Promise.resolve({})),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  suspendClient: vi.fn(),
  activateClient: vi.fn(),
  getClientUsage: vi.fn(),
}))

// ── Layout / páginas: stubs para isolar o roteamento ────────
vi.mock('../components/ErrorBoundary', () => ({ default: ({ children }) => children }))
vi.mock('../components/ThemeCustomizer', () => ({ default: () => null }))
vi.mock('../components/layout/AppShell', async () => {
  const { Outlet } = await import('react-router-dom')
  return { default: () => <Outlet /> }
})

vi.mock('../pages/Login', () => ({ default: () => <div>PAGE_LOGIN</div> }))
vi.mock('../pages/ActivateAccount', () => ({ default: () => <div>PAGE_ACTIVATE</div> }))
vi.mock('../pages/ResetPassword', () => ({ default: () => <div>PAGE_RESET</div> }))
vi.mock('../pages/NoEvent', () => ({ default: () => <div>PAGE_NO_EVENT</div> }))
vi.mock('../pages/master/MasterDashboard', () => ({ default: () => <div>PAGE_MASTER</div> }))
vi.mock('../pages/master/ClientsManager', () => ({ default: () => <div>PAGE_CLIENTS</div> }))
vi.mock('../pages/master/ClientDetail', () => ({ default: () => <div>PAGE_CLIENT_DETAIL</div> }))
vi.mock('../pages/admin/AdminHome', () => ({ default: () => <div>PAGE_ADMIN_HOME</div> }))
vi.mock('../pages/admin/EventsList', () => ({ default: () => <div>PAGE_EVENTS_LIST</div> }))
vi.mock('../pages/admin/EventForm', () => ({ default: () => <div>PAGE_EVENT_FORM</div> }))
vi.mock('../pages/admin/EventDetail', () => ({ default: () => <div>PAGE_EVENT_DETAIL</div> }))
vi.mock('../pages/admin/EventConfig', () => ({ default: () => <div>PAGE_EVENT_CONFIG</div> }))
vi.mock('../pages/admin/TeamManager', () => ({ default: () => <div>PAGE_TEAM</div> }))
vi.mock('../pages/admin/BatchManager', () => ({ default: () => <div>PAGE_BATCH</div> }))
vi.mock('../pages/admin/TicketsManager', () => ({ default: () => <div>PAGE_TICKETS</div> }))
vi.mock('../pages/admin/UsersManager', () => ({ default: () => <div>PAGE_USERS</div> }))
vi.mock('../pages/admin/TerminalManager', () => ({ default: () => <div>PAGE_TERMINAL_MANAGER</div> }))
vi.mock('../pages/supervisor/EventDashboard', () => ({ default: () => <div>PAGE_EVENT_DASHBOARD</div> }))
vi.mock('../pages/supervisor/GatesPanel', () => ({ default: () => <div>PAGE_GATES</div> }))
vi.mock('../pages/supervisor/ReportsPanel', () => ({ default: () => <div>PAGE_REPORTS</div> }))
vi.mock('../pages/terminal/Terminal', () => ({ default: () => <div>PAGE_TERMINAL</div> }))
vi.mock('../pages/terminal/JoinTerminal', () => ({ default: () => <div>PAGE_JOIN</div> }))

const GATE_TEXT = 'Selecione um cliente'

function setUser(user, { tenantId = null, tenantName = null } = {}) {
  useAuthStore.setState({ user, token: 'tok', isAuthenticated: true })
  useScopeStore.setState({ tenantId, tenantName })
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
}

describe('Proteção de rotas por perfil/contexto', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false })
    useScopeStore.setState({ tenantId: null, tenantName: null })
  })

  it('T-route-1: master sem cliente vê a seleção de cliente nas rotas de admin', () => {
    setUser({ id: '1', name: 'Master', role: 'master' })
    renderAt('/admin/eventos')
    expect(screen.getByText(GATE_TEXT)).toBeInTheDocument()
    expect(screen.queryByText('PAGE_EVENTS_LIST')).not.toBeInTheDocument()
  })

  it('T-route-2: master com cliente acessa o painel de eventos', () => {
    setUser({ id: '1', name: 'Master', role: 'master' }, { tenantId: 't1', tenantName: 'Cliente X' })
    renderAt('/admin/eventos')
    expect(screen.getByText('PAGE_EVENTS_LIST')).toBeInTheDocument()
  })

  it.each(['/supervisor/evt-1', '/supervisor/evt-1/portoes', '/supervisor/evt-1/relatorio'])(
    'T-route-3: master sem cliente NÃO acessa %s',
    (path) => {
      setUser({ id: '1', name: 'Master', role: 'master' })
      renderAt(path)
      expect(screen.getByText(GATE_TEXT)).toBeInTheDocument()
      expect(screen.queryByText('PAGE_EVENT_DASHBOARD')).not.toBeInTheDocument()
      expect(screen.queryByText('PAGE_GATES')).not.toBeInTheDocument()
      expect(screen.queryByText('PAGE_REPORTS')).not.toBeInTheDocument()
    }
  )

  it('T-route-4: master com cliente acessa a operação do evento', () => {
    setUser({ id: '1', name: 'Master', role: 'master' }, { tenantId: 't1' })
    renderAt('/supervisor/evt-1/portoes')
    expect(screen.getByText('PAGE_GATES')).toBeInTheDocument()
  })

  it('T-route-5: admin acessa as rotas de supervisor sem exigir seleção de cliente', () => {
    setUser({ id: '2', name: 'Admin', role: 'admin', tenant_id: 't1' })
    renderAt('/supervisor/evt-1')
    expect(screen.getByText('PAGE_EVENT_DASHBOARD')).toBeInTheDocument()
  })

  it('T-route-6: supervisor é bloqueado nas rotas de admin', () => {
    setUser({ id: '3', name: 'Supervisor', role: 'supervisor', tenant_id: 't1' })
    renderAt('/admin/eventos/evt-1/editar')
    expect(screen.getByText('Nenhum evento em acesso')).toBeInTheDocument()
    expect(screen.queryByText('PAGE_EVENT_FORM')).not.toBeInTheDocument()
  })

  it('T-route-7: master acessa a área da plataforma sem exigir cliente', () => {
    setUser({ id: '1', name: 'Master', role: 'master' })
    renderAt('/master')
    expect(screen.getByText('PAGE_MASTER')).toBeInTheDocument()
  })
})

describe('resolveNav — separação de escopos', () => {
  it('T-nav-1: master separa "Plataforma" de "Cliente"', () => {
    const sections = resolveNav('/admin/eventos', { role: 'master' }, { tenantName: 'Cliente X' })
    expect(sections.map((s) => s.title)).toEqual(['Plataforma', 'Cliente · Cliente X'])
    expect(sections[0].items.map((i) => i.to)).toEqual(['/master', '/master/clientes'])
    expect(sections[1].items.map((i) => i.to)).toEqual(['/admin/eventos', '/admin/usuarios'])
  })

  it('T-nav-2: admin usa a seção "Geral"', () => {
    const sections = resolveNav('/admin', { role: 'admin' })
    expect(sections.map((s) => s.title)).toEqual(['Geral'])
  })

  it('T-nav-3: master sem cliente usa o título genérico "Cliente"', () => {
    const sections = resolveNav('/admin/eventos', { role: 'master' })
    expect(sections[1].title).toBe('Cliente')
  })

  it('T-nav-4: rota de evento adiciona a seção "Evento"', () => {
    const evt = '123e4567-e89b-12d3-a456-426614174000'
    const sections = resolveNav(`/supervisor/${evt}`, { role: 'supervisor' })
    expect(sections.map((s) => s.title)).toEqual(['Evento'])
    expect(eventIdFromPath(`/supervisor/${evt}/portoes`)).toBe(evt)
  })
})
