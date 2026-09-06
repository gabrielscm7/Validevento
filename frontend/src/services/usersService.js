import api from './api'

// GET /api/users — admin vê o próprio tenant; master passa ?tenant_id
export async function listUsers(tenantId) {
  const params = tenantId ? { tenant_id: tenantId } : {}
  const { data } = await api.get('/api/users', { params })
  return data
}

export async function createUser(payload) {
  const { data } = await api.post('/api/users', payload)
  return data
}

export async function updateUser(id, payload) {
  const { data } = await api.put(`/api/users/${id}`, payload)
  return data
}

export async function deactivateUser(id) {
  const { data } = await api.patch(`/api/users/${id}/deactivate`)
  return data
}
