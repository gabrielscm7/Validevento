import api from './api'

// GET /api/events/:id/dashboard/summary
export async function getDashboardSummary(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/dashboard/summary`)
  return data
}

export async function getDashboardFlow(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/dashboard/flow`)
  return data
}

export async function getDashboardBatches(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/dashboard/batches`)
  return data
}

export async function getDashboardAlerts(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/dashboard/alerts`)
  return data
}

export async function getDashboardTerminals(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/dashboard/terminals`)
  return data
}

export async function getDashboardLiveFeed(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/dashboard/live-feed`)
  return data
}

export async function getDashboardSpeed(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/dashboard/speed`)
  return data
}
