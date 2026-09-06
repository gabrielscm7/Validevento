import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { homeForRole } from '../lib/roles'
import Logo from './Logo'

function NoEventScreen({ role }) {
  return (
    <div className="page">
      <div className="page-body narrow">
        <div className="empty" style={{ paddingTop: 80 }}>
          <Logo withText />
          <div style={{ marginTop: 32 }}>
            <p className="empty-title">Nenhum evento em acesso</p>
            <p className="empty-sub">
              {role === 'validator'
                ? 'Você precisa do link de um evento para abrir a portaria.'
                : 'Você ainda não foi vinculado a nenhum evento. Fale com o administrador.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Guard de rotas privadas.
 *  - Não autenticado → /login
 *  - Perfil fora de allowedRoles → home do perfil (ou tela "sem evento")
 */
export function PrivateRoute({ children, allowedRoles }) {
  const { user, isAuthenticated } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const home = homeForRole(user)
    if (home) return <Navigate to={home} replace />
    return <NoEventScreen role={user.role} />
  }

  return children
}

export default PrivateRoute
