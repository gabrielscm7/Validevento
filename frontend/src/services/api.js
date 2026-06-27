import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const API_BASE = import.meta.env.VITE_API_URL || 'https://backend-production-9738e.up.railway.app'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
})

// Injeta token JWT em toda requisição autenticada
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ve_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Trata erros globais de autenticação
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ve_token')
      localStorage.removeItem('ve_auth')
      useAuthStore.setState({ user: null, token: null })
    }
    return Promise.reject(err)
  }
)

export default api
