import api from './api'

export async function listClients() {
  const { data } = await api.get('/api/clients')
  return data
}

export async function getClient(id) {
  const { data } = await api.get(`/api/clients/${id}`)
  return data
}

export async function createClient(payload) {
  const { data } = await api.post('/api/clients', payload)
  return data
}

export async function updateClient(id, payload) {
  const { data } = await api.put(`/api/clients/${id}`, payload)
  return data
}

export async function suspendClient(id) {
  const { data } = await api.patch(`/api/clients/${id}/suspend`)
  return data
}

export async function activateClient(id) {
  const { data } = await api.patch(`/api/clients/${id}/activate`)
  return data
}

export async function getClientUsage(id) {
  const { data } = await api.get(`/api/clients/${id}/usage`)
  return data
}
