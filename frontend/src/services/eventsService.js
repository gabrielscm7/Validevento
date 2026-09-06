import api from './api'

// GET /api/events — lista do tenant (admin) ou todos (master com ?tenant_id)
export async function listEvents(params = {}) {
  const { data } = await api.get('/api/events', { params })
  return data
}

export async function getEvent(eventId) {
  const { data } = await api.get(`/api/events/${eventId}`)
  return data
}

export async function createEvent(payload) {
  const { data } = await api.post('/api/events', payload)
  return data
}

export async function updateEvent(eventId, payload) {
  const { data } = await api.put(`/api/events/${eventId}`, payload)
  return data
}

export async function changeEventStatus(eventId, status) {
  const { data } = await api.patch(`/api/events/${eventId}/status`, { status })
  return data
}
