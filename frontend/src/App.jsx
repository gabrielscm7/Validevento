import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { PrivateRoute } from './components/PrivateRoute'
import { homeForRole } from './lib/roles'
import ErrorBoundary from './components/ErrorBoundary'
import NoEventScreen from './pages/NoEvent'

import Login from './pages/Login'
import ActivateAccount from './pages/ActivateAccount'
import ResetPassword from './pages/ResetPassword'

import MasterDashboard from './pages/master/MasterDashboard'
import ClientsManager from './pages/master/ClientsManager'
import ClientDetail from './pages/master/ClientDetail'

import AdminHome from './pages/admin/AdminHome'
import EventsList from './pages/admin/EventsList'
import EventForm from './pages/admin/EventForm'
import EventDetail from './pages/admin/EventDetail'
import EventConfig from './pages/admin/EventConfig'
import TeamManager from './pages/admin/TeamManager'
import BatchManager from './pages/admin/BatchManager'
import TicketsManager from './pages/admin/TicketsManager'
import UsersManager from './pages/admin/UsersManager'

import EventDashboard from './pages/supervisor/EventDashboard'
import GatesPanel from './pages/supervisor/GatesPanel'
import ReportsPanel from './pages/supervisor/ReportsPanel'

import Terminal from './pages/terminal/Terminal'

/** Redireciona usuário já autenticado que acessa rota pública. */
function PublicOnly({ children }) {
  const { user, isAuthenticated } = useAuthStore()
  if (isAuthenticated && user) {
    const home = homeForRole(user)
    return <Navigate to={home || '/sem-evento'} replace />
  }
  return children
}

/** Rota catch-all por perfil. */
function HomeRedirect() {
  const { user, isAuthenticated } = useAuthStore()
  const location = useLocation()
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  const home = homeForRole(user)
  return <Navigate to={home || '/sem-evento'} replace />
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Públicas */}
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/ativar" element={<ActivateAccount />} />
        <Route path="/recuperar-senha" element={<ResetPassword />} />
        <Route path="/sem-evento" element={<PrivateRoute><NoEventScreen /></PrivateRoute>} />

        {/* Master */}
        <Route path="/master" element={<PrivateRoute allowedRoles={['master']}><MasterDashboard /></PrivateRoute>} />
        <Route path="/master/clientes" element={<PrivateRoute allowedRoles={['master']}><ClientsManager /></PrivateRoute>} />
        <Route path="/master/clientes/:id" element={<PrivateRoute allowedRoles={['master']}><ClientDetail /></PrivateRoute>} />

        {/* Admin */}
        <Route path="/admin" element={<PrivateRoute allowedRoles={['admin']}><AdminHome /></PrivateRoute>} />
        <Route path="/admin/eventos" element={<PrivateRoute allowedRoles={['admin']}><EventsList /></PrivateRoute>} />
        <Route path="/admin/eventos/novo" element={<PrivateRoute allowedRoles={['admin']}><EventForm /></PrivateRoute>} />
        <Route path="/admin/eventos/:id" element={<PrivateRoute allowedRoles={['admin']}><EventDetail /></PrivateRoute>} />
        <Route path="/admin/eventos/:id/editar" element={<PrivateRoute allowedRoles={['admin']}><EventForm /></PrivateRoute>} />
        <Route path="/admin/eventos/:id/config" element={<PrivateRoute allowedRoles={['admin']}><EventConfig /></PrivateRoute>} />
        <Route path="/admin/eventos/:id/equipe" element={<PrivateRoute allowedRoles={['admin']}><TeamManager /></PrivateRoute>} />
        <Route path="/admin/eventos/:id/lotes" element={<PrivateRoute allowedRoles={['admin']}><BatchManager /></PrivateRoute>} />
        <Route path="/admin/eventos/:id/ingressos" element={<PrivateRoute allowedRoles={['admin']}><TicketsManager /></PrivateRoute>} />
        <Route path="/admin/usuarios" element={<PrivateRoute allowedRoles={['admin']}><UsersManager /></PrivateRoute>} />

        {/* Supervisor */}
        <Route path="/supervisor/:eventId" element={<PrivateRoute allowedRoles={['supervisor', 'admin']}><EventDashboard /></PrivateRoute>} />
        <Route path="/supervisor/:eventId/portoes" element={<PrivateRoute allowedRoles={['supervisor', 'admin']}><GatesPanel /></PrivateRoute>} />
        <Route path="/supervisor/:eventId/relatorio" element={<PrivateRoute allowedRoles={['supervisor', 'admin']}><ReportsPanel /></PrivateRoute>} />

        {/* Terminal (portaria) */}
        <Route path="/terminal/:eventId" element={<PrivateRoute allowedRoles={['validator', 'supervisor', 'admin']}><Terminal /></PrivateRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </ErrorBoundary>
  )
}
