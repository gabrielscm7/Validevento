import api from './api'

export async function fetchMe() {
  const { data } = await api.get('/api/auth/me')
  return data.user
}

export async function loginApi(cpf, password) {
  const { data } = await api.post('/api/auth/login', { cpf, password })
  return data
}

export async function logoutApi() {
  try {
    await api.post('/api/auth/logout')
  } catch { /* logout local sempre procede */ }
}

export async function verifyEmailApi(token, password) {
  const { data } = await api.post('/api/auth/verify-email', { token, password })
  return data
}

export async function resendVerificationApi(email) {
  const { data } = await api.post('/api/auth/resend-verification', { email })
  return data
}

export async function forgotPasswordApi(email) {
  const { data } = await api.post('/api/auth/forgot-password', { email })
  return data
}

export async function resetPasswordApi(token, password) {
  const { data } = await api.post('/api/auth/reset-password', { token, password })
  return data
}
