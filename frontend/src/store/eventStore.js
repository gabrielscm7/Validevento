import { create } from 'zustand'
import api from '../services/api'
import { saveMeta } from '../services/localDB'

/**
 * Store do evento ativo (dashboard/supervisor) e da configuração que também
 * é espelhada no IndexedDB (meta 'event_config'/'master_ticket') para o
 * terminal operar offline com a mesma configuração.
 */
export const useEventStore = create((set, get) => ({
  activeEvent: null,
  eventConfig: null,
  masterTicket: null,
  loading: false,
  error: null,

  loadEvent: async (eventId) => {
    if (!eventId) return null
    set({ loading: true, error: null })
    try {
      const { data } = await api.get(`/api/events/${eventId}`)
      set({ activeEvent: data, loading: false })
      return data
    } catch (err) {
      set({ loading: false, error: err?.response?.data?.error || err?.message || 'Erro ao carregar evento.' })
      throw err
    }
  },

  loadConfig: async (eventId) => {
    if (!eventId) return null
    set({ loading: true, error: null })
    try {
      const { data } = await api.get(`/api/events/${eventId}/config`)
      await saveMeta('event_config', data)
      set({ eventConfig: data, loading: false })
      return data
    } catch (err) {
      set({ loading: false, error: err?.response?.data?.error || err?.message || 'Erro ao carregar configuração.' })
      throw err
    }
  },

  updateConfig: async (eventId, dataPayload) => {
    if (!eventId) return null
    const { data } = await api.put(`/api/events/${eventId}/config`, dataPayload)
    await saveMeta('event_config', data)
    set({ eventConfig: data })
    return data
  },

  toggleCheckout: async (eventId, enabled) => {
    if (!eventId) return null
    const { data } = await api.patch(`/api/events/${eventId}/config/checkout`, {
      checkout_enabled: enabled,
    })
    await saveMeta('event_config', data)
    set({ eventConfig: data })
    return data
  },

  setMasterTicket: (mt) => {
    set({ masterTicket: mt })
    if (mt) saveMeta('master_ticket', mt)
  },

  reset: () => set({ activeEvent: null, eventConfig: null, masterTicket: null, error: null }),
}))
