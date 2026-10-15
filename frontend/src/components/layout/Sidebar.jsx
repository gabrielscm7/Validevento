import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useScopeStore } from '../../store/scopeStore'
import { useUIStore } from '../../store/uiStore'
import { useThemeStore } from '../../store/themeStore'
import { resolveIsDark } from '../../lib/theme'
import { resolveNav, eventIdFromPath } from '../../lib/nav'
import { useCurrentEvent } from '../../hooks/useCurrentEvent'
import { ROLE_LABEL, initials } from '../../lib/format'
import Logo from '../Logo'
import { NavIcon } from './icons'

const EVENT_STATUS = {
  active: { label: 'Ativo', cls: 'badge-green' },
  draft: { label: 'Rascunho', cls: 'badge-gray' },
  closed: { label: 'Encerrado', cls: 'badge-red' },
}

function navClass({ isActive }) {
  return `snav-item ${isActive ? 'active' : ''}`
}

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const { closeSidebar, collapsed, toggleCollapsed } = useUIStore()
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)

  const tenantName = useScopeStore((s) => s.tenantName)
  const sections = resolveNav(location.pathname, user, { tenantName })
  const isDark = resolveIsDark(mode)

  const eventId = eventIdFromPath(location.pathname)
  const event = useCurrentEvent(eventId)
  const status = event ? EVENT_STATUS[event.status] : null

  function handleLogout() {
    logout()
    useScopeStore.getState().clearTenant()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="sidenav" aria-label="Navegação principal">
      <div className="snav-brand">
        <Link to="/" className="snav-logo" aria-label="Validevento" onClick={closeSidebar}>
          <Logo withText compact />
        </Link>
        <button
          type="button"
          className="snav-collapse"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <NavIcon name="chevron" size={16} />
        </button>
      </div>

      <nav className="snav-scroll">
        {sections.map((section) => (
          <div key={section.title} className="snav-section">
            <div className="snav-section-head">
              <span className="snav-section-title">{section.title}</span>
              {section.title === 'Evento' && status && (
                <span className={`badge ${status.cls} snav-status`}>{status.label}</span>
              )}
            </div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navClass}
                onClick={closeSidebar}
                title={item.label}
              >
                <span className="snav-ico"><NavIcon name={item.icon} /></span>
                <span className="snav-label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}

        {eventId && (
          <div className="snav-section">
            <span className="snav-section-title">Operação</span>
            <Link to={`/terminal/${eventId}`} className="snav-item snav-item-alt" onClick={closeSidebar} title="Abrir terminal">
              <span className="snav-ico"><NavIcon name="terminal" /></span>
              <span className="snav-label">Abrir terminal</span>
            </Link>
          </div>
        )}
      </nav>

      <div className="snav-foot">
        <button
          type="button"
          className="snav-theme"
          onClick={() => setMode(isDark ? 'light' : 'dark')}
          title={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
        >
          <NavIcon name={isDark ? 'sun' : 'moon'} size={17} />
          <span className="snav-label">{isDark ? 'Modo claro' : 'Modo escuro'}</span>
        </button>

        <div className="snav-user">
          <span className="avatar" title={user?.name}>{initials(user?.name)}</span>
          <div className="snav-user-meta">
            <span className="snav-user-name truncate">{user?.name}</span>
            <span className="snav-user-role">{user?.role ? ROLE_LABEL[user.role] || user.role : ''}</span>
          </div>
          <button type="button" className="snav-logout" onClick={handleLogout} aria-label="Sair" title="Sair">
            <NavIcon name="logout" size={17} />
          </button>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
