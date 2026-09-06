import api from './api'

// ── Config ──
export async function getConfig(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/config`)
  return data
}

export async function updateConfig(eventId, payload) {
  const { data } = await api.put(`/api/events/${eventId}/config`, payload)
  return data
}

export async function toggleCheckoutApi(eventId, enabled) {
  const { data } = await api.patch(`/api/events/${eventId}/config/checkout`, {
    checkout_enabled: enabled,
  })
  return data
}

// ── Equipe ──
export async function listTeam(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/team`)
  return data
}

export async function addTeamMember(eventId, userId, roleOverride = null) {
  const { data } = await api.post(`/api/events/${eventId}/team`, { user_id: userId, role_override: roleOverride })
  return data
}

export async function removeTeamMember(eventId, userId) {
  const { data } = await api.delete(`/api/events/${eventId}/team/${userId}`)
  return data
}

// ── Lotes ──
export async function listEventBatches(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/batches`)
  return data
}

export async function createEventBatch(eventId, payload) {
  const { data } = await api.post(`/api/events/${eventId}/batches`, payload)
  return data
}

export async function updateEventBatch(eventId, batchId, payload) {
  const { data } = await api.put(`/api/events/${eventId}/batches/${batchId}`, payload)
  return data
}

export async function deleteEventBatch(eventId, batchId) {
  const { data } = await api.delete(`/api/events/${eventId}/batches/${batchId}`)
  return data
}

// ── Ingressos ──
export async function listTickets(eventId, params = {}) {
  const { data } = await api.get(`/api/events/${eventId}/tickets`, { params })
  return data
}

export async function blockTicket(eventId, ticketId) {
  const { data } = await api.patch(`/api/events/${eventId}/tickets/${ticketId}/block`)
  return data
}

export async function unblockTicket(eventId, ticketId) {
  const { data } = await api.patch(`/api/events/${eventId}/tickets/${ticketId}/unblock`)
  return data
}

// ── Ingressos de emergência ──
export async function getMasterTicket(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/master-ticket`)
  return data
}

export async function createMasterTicket(eventId, maxUses) {
  const { data } = await api.post(`/api/events/${eventId}/master-ticket`, {
    max_uses: maxUses === undefined || maxUses === null || maxUses === '' ? null : Number(maxUses),
  })
  return data
}

export async function deactivateMasterTicket(eventId) {
  const { data } = await api.delete(`/api/events/${eventId}/master-ticket`)
  return data
}

export async function createInvitation(eventId, payload) {
  const { data } = await api.post(`/api/events/${eventId}/invitations`, payload)
  return data
}

// ── Portões ──
export async function listGates(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/gates`)
  return data
}

export async function createGate(eventId, name) {
  const { data } = await api.post(`/api/events/${eventId}/gates`, { name })
  return data
}

export async function openGate(eventId, gateId) {
  const { data } = await api.patch(`/api/events/${eventId}/gates/${gateId}/open`)
  return data
}

export async function closeGate(eventId, gateId) {
  const { data } = await api.patch(`/api/events/${eventId}/gates/${gateId}/close`)
  return data
}
