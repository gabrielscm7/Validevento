import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Terminal from './pages/Terminal'
import Dashboard from './pages/Dashboard'
import AdminConfig from './pages/AdminConfig'

function ProtectedRoute({ children, allowedRoles }) {
  const { user, token } = useAuthStore()
  if (!token || !user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/terminal" replace />
  return children
}

function PublicRoute({ children }) {
  const { token } = useAuthStore()
  if (token) {
    const role = useAuthStore.getState().user?.role
    return <Navigate to={role === 'admin' || role === 'supervisor' ? '/dashboard' : '/terminal'} replace />
  }
  return children
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/terminal" element={<ProtectedRoute><Terminal /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin', 'supervisor']}><Dashboard /></ProtectedRoute>} />
        <Route path="/admin/config" element={<ProtectedRoute allowedRoles={['admin']}><AdminConfig /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
