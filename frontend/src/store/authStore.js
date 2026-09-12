import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'

const TOKEN_KEY = 've_token'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (cpf, password) => {
        const { data } = await api.post('/api/auth/login', { cpf, password })
        localStorage.setItem(TOKEN_KEY, data.token)
        set({ user: data.user, token: data.token, isAuthenticated: true })
        return data.user
      },

      /** Define sessão a partir de token + user (verify-email, /me, etc.). */
      applySession: (token, user) => {
        if (token) localStorage.setItem(TOKEN_KEY, token)
        set({ user, token: token || get().token, isAuthenticated: true })
      },

      logout: () => {
        localStorage.removeItem(TOKEN_KEY)
        set({ user: null, token: null, isAuthenticated: false })
      },

      restoreSession: () => {
        const token = localStorage.getItem(TOKEN_KEY)
        if (!token || !get().user) return

        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          if (payload.exp && payload.exp * 1000 < Date.now()) {
            // Token expirado — limpa estado e força novo login
            localStorage.removeItem(TOKEN_KEY)
            set({ user: null, token: null, isAuthenticated: false })
            return
          }
        } catch {
          // Token malformado — limpa por segurança
          localStorage.removeItem(TOKEN_KEY)
          set({ user: null, token: null, isAuthenticated: false })
          return
        }

        set({ token, isAuthenticated: true })
      },

      isAdmin: () => get().user?.role === 'admin',
      isSupervisor: () => ['admin', 'supervisor'].includes(get().user?.role),
      isValidator: () => !!get().user,
    }),
    { name: 've_auth', partialize: (s) => ({ user: s.user, token: s.token }) }
  )
)

// Restaura a sessão (token) ao iniciar a aplicação
if (typeof window !== 'undefined') {
  useAuthStore.getState().restoreSession()
}
