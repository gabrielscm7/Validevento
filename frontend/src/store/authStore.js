import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user:  null,
      token: null,

      login: async (email, password) => {
        const { data } = await api.post('/api/auth/login', { email, password })
        localStorage.setItem('ve_token', data.token)
        set({ user: data.user, token: data.token })
        return data.user
      },

      logout: () => {
        localStorage.removeItem('ve_token')
        set({ user: null, token: null })
      },

      isAuthenticated: () => !!get().token,
      isAdmin:         () => get().user?.role === 'admin',
      isSupervisor:    () => ['admin', 'supervisor'].includes(get().user?.role),
      isValidator:     () => !!get().user,
    }),
    { name: 've_auth', partialize: (s) => ({ user: s.user, token: s.token }) }
  )
)
