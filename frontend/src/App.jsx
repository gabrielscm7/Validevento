import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { PrivateRoute } from './components/PrivateRoute'
import { homeForRole } from './lib/roles'
import ErrorBoundary from './components/ErrorBoundary'
import ThemeCustomizer from './components/ThemeCustomizer'
import AppShell from './components/layout/AppShell'
import NoEventScreen from './pages/NoEvent'
import { MasterTenantGate } from './components/master/MasterTenantGate'

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
import TerminalManager from './pages/admin/TerminalManager'

import EventDashboard from './pages/supervisor/EventDashboard'
import GatesPanel from './pages/supervisor/GatesPanel'
import ReportsPanel from './pages/supervisor/ReportsPanel'

import Terminal from './pages/terminal/Terminal'
import JoinTerminal from './pages/terminal/JoinTerminal'

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

        {/* Área autenticada — layout com menu lateral */}
        <Route element={<PrivateRoute><AppShell /></PrivateRoute>}>
          {/* Master */}
          <Route path="/master" element={<PrivateRoute allowedRoles={['master']}><MasterDashboard /></PrivateRoute>} />
          <Route path="/master/clientes" element={<PrivateRoute allowedRoles={['master']}><ClientsManager /></PrivateRoute>} />
          <Route path="/master/clientes/:id" element={<PrivateRoute allowedRoles={['master']}><ClientDetail /></PrivateRoute>} />

          {/* Admin (acessível também ao master, que opera por contexto de cliente) */}
          <Route path="/admin" element={<MasterTenantGate><PrivateRoute allowedRoles={['admin', 'master']}><AdminHome /></PrivateRoute></MasterTenantGate>} />
          <Route path="/admin/eventos" element={<MasterTenantGate><PrivateRoute allowedRoles={['admin', 'master']}><EventsList /></PrivateRoute></MasterTenantGate>} />
          <Route path="/admin/eventos/novo" element={<MasterTenantGate><PrivateRoute allowedRoles={['admin', 'master']}><EventForm /></PrivateRoute></MasterTenantGate>} />
          <Route path="/admin/eventos/:id" element={<MasterTenantGate><PrivateRoute allowedRoles={['admin', 'master']}><EventDetail /></PrivateRoute></MasterTenantGate>} />
          <Route path="/admin/eventos/:id/editar" element={<MasterTenantGate><PrivateRoute allowedRoles={['admin', 'master']}><EventForm /></PrivateRoute></MasterTenantGate>} />
          <Route path="/admin/eventos/:id/config" element={<MasterTenantGate><PrivateRoute allowedRoles={['admin', 'master']}><EventConfig /></PrivateRoute></MasterTenantGate>} />
          <Route path="/admin/eventos/:id/equipe" element={<MasterTenantGate><PrivateRoute allowedRoles={['admin', 'master']}><TeamManager /></PrivateRoute></MasterTenantGate>} />
          <Route path="/admin/eventos/:id/lotes" element={<MasterTenantGate><PrivateRoute allowedRoles={['admin', 'master']}><BatchManager /></PrivateRoute></MasterTenantGate>} />
          <Route path="/admin/eventos/:id/ingressos" element={<MasterTenantGate><PrivateRoute allowedRoles={['admin', 'master']}><TicketsManager /></PrivateRoute></MasterTenantGate>} />
          <Route path="/admin/eventos/:id/terminais" element={<MasterTenantGate><PrivateRoute allowedRoles={['admin', 'master']}><TerminalManager /></PrivateRoute></MasterTenantGate>} />
          <Route path="/admin/usuarios" element={<MasterTenantGate><PrivateRoute allowedRoles={['admin', 'master']}><UsersManager /></PrivateRoute></MasterTenantGate>} />

          {/* Supervisor */}
          <Route path="/supervisor/:eventId" element={<PrivateRoute allowedRoles={['supervisor', 'admin', 'master']}><EventDashboard /></PrivateRoute>} />
          <Route path="/supervisor/:eventId/portoes" element={<PrivateRoute allowedRoles={['supervisor', 'admin', 'master']}><GatesPanel /></PrivateRoute>} />
          <Route path="/supervisor/:eventId/relatorio" element={<PrivateRoute allowedRoles={['supervisor', 'admin', 'master']}><ReportsPanel /></PrivateRoute>} />
        </Route>

        {/* Terminal genérico (acesso público por slug) */}
        <Route path="/terminal/join/:slug" element={<JoinTerminal />} />
        <Route path="/terminal/join/:slug/app" element={<Terminal />} />

        {/* Terminal (portaria) */}
        <Route path="/terminal/:eventId" element={<PrivateRoute allowedRoles={['validator', 'supervisor', 'admin', 'master']}><Terminal /></PrivateRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
      <ThemeCustomizer />
    </ErrorBoundary>
  )
}
