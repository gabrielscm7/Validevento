import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { eventIdFromPath } from '../lib/nav'
import { useCurrentEvent } from '../hooks/useCurrentEvent'
import Logo from './Logo'
import Breadcrumbs from './layout/Breadcrumbs'
import EventTabs from './layout/EventTabs'
import EventSwitcher from './layout/EventSwitcher'
import { NavIcon } from './layout/icons'
import { ROLE_LABEL, initials } from '../lib/format'

/**
 * Cabeçalho compartilhado: menu, logo, trilha de navegação e (quando dentro
 * de um evento) as abas internas. O evento vem do eventStore via
 * useCurrentEvent.
 */
export function TopBar({ eventName: eventNameProp, crumb, customLogo, onBack }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { openSidebar, toggleCollapsed } = useUIStore()
  const location = useLocation()

  const eventId = eventIdFromPath(location.pathname)
  const event = useCurrentEvent(eventId)
  const eventName = event?.name || eventNameProp

  function handleMenuClick() {
    const mobile = typeof window !== 'undefined'
      && window.matchMedia && window.matchMedia('(max-width: 900px)').matches
    if (mobile) openSidebar()
    else toggleCollapsed()
  }

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <button
            type="button"
            className="topbar-menu"
            onClick={handleMenuClick}
            aria-label="Alternar menu lateral"
            title="Menu"
          >
            <NavIcon name="menu" size={19} />
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="btn-ghost btn-sm"
              aria-label="Voltar"
            >
              ← Voltar
            </button>
          )}

          {customLogo ? (
            <img
              src={customLogo}
              alt="Logo do evento"
              style={{ height: 34, maxWidth: 150, objectFit: 'contain' }}
            />
          ) : (
            <Link to="/" aria-label="Validevento" className="topbar-home">
              <Logo withText compact />
            </Link>
          )}

          <div className="topbar-context">
            <Breadcrumbs pathname={location.pathname} eventName={eventName} crumb={crumb} />
          </div>
        </div>

        <div className="topbar-right">
          <div className="user-chip">
            <span className="avatar" title={user?.name}>
              {initials(user?.name)}
            </span>
            <div className="user-meta">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">
                {user?.role ? ROLE_LABEL[user.role] || user.role : ''}
              </span>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="btn-outline btn-sm">
            Sair
          </button>
        </div>
      </div>

      {eventId && (
        <div className="topbar-subbar">
          <EventTabs eventId={eventId} role={user?.role} />
          <EventSwitcher eventId={eventId} eventName={eventName} />
        </div>
      )}
    </header>
  )
}

export default TopBar
