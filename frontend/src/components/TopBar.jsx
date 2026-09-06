import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import Logo from './Logo'
import { ROLE_LABEL, initials } from '../lib/format'

/**
 * Barra superior compartilhada por todas as telas (exceto o Terminal).
 * Props:
 *  - eventName / crumb: contexto de evento (breadcrumb)
 *  - logoUrl / bannerUrl? -> eventStore já resolve; aqui aceitamos customLogo
 */
export function TopBar({ eventName, crumb, customLogo, onBack }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
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
            <Link to="/" aria-label="Validevento">
              <Logo withText compact />
            </Link>
          )}

          {(eventName || crumb) && (
            <div className="topbar-context">
              {eventName && <span className="topbar-event">{eventName}</span>}
              {crumb && <span className="topbar-crumb">{crumb}</span>}
            </div>
          )}
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
            <span className={`role-badge pill ${user?.role || ''} hidden`}>
              {user?.role ? ROLE_LABEL[user.role] || user.role : ''}
            </span>
          </div>
          <button type="button" onClick={handleLogout} className="btn-outline btn-sm">
            Sair
          </button>
        </div>
      </div>
    </header>
  )
}

export default TopBar
