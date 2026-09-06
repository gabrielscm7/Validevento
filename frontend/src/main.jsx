import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Restauração da sessão: zustand persist reidrata user/token. Se houver token
// sem usuário, busca /api/auth/me para validar (o interceptor do axios limpa
// sessão em 401).
import { useAuthStore } from './store/authStore'
import { fetchMe } from './services/authService'

async function bootstrap() {
  const { token, user } = useAuthStore.getState()
  if (token && !user) {
    try {
      const fresh = await fetchMe()
      useAuthStore.setState({ user: fresh, isAuthenticated: true })
    } catch {
      useAuthStore.getState().logout()
    }
  } else if (token && user) {
    useAuthStore.setState({ isAuthenticated: true })
  }
}

bootstrap()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
