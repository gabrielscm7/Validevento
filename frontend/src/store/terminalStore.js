import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'
import {
  setEventId,
  setTerminalId,
  getTerminalId,
  saveMeta,
  getMeta,
} from '../services/localDB'

export const useTerminalStore = create(
  persist(
    (set, get) => ({
      terminalId: null,
      terminalName: null,
      eventId: import.meta.env.VITE_EVENT_ID || null,
      lastResult: null,
      loadingEvent: false,
      initialized: false,

      /**
       * Cria/recupera o terminal_id do meta. Se receber eventId, também o
       * persiste (é o evento em operação neste dispositivo).
       */
      initTerminal: async (eventId) => {
        let terminalId = await getTerminalId()
        if (!terminalId) {
          terminalId = crypto.randomUUID()
          await setTerminalId(terminalId)
        }

        if (eventId) {
          await setEventId(eventId)
        }

        const resolvedEventId = eventId || get().eventId
        const name = await getMeta('terminal_name')
        set({
          terminalId,
          terminalName: name || get().terminalName || 'Terminal de Portaria',
          eventId: resolvedEventId,
          initialized: true,
        })
        return terminalId
      },

      setLastResult: (result) => set({ lastResult: result }),

      setTerminal: async ({ terminalId, terminalName }) => {
        set({ terminalId, terminalName })
        if (terminalId) await setTerminalId(terminalId)
        if (terminalName) await saveMeta('terminal_name', terminalName)
      },

      setEvent: async ({ eventId }) => {
        set({ eventId })
        if (eventId) await setEventId(eventId)
      },

      clear: () => set({ terminalId: null, terminalName: null, lastResult: null }),

      isConfigured: () => !!get().terminalId && !!get().eventId,

      /** Fallback v1: detecta evento ativo quando não configurado (mantido). */
      ensureEvent: async () => {
        if (get().eventId) return
        if (get().loadingEvent) return
        set({ loadingEvent: true })
        try {
          const response = await api.get('/api/events/active')
          const event = response.data
          if (event && event.id) {
            set({ eventId: event.id, loadingEvent: false })
            await setEventId(event.id)
          } else {
            set({ loadingEvent: false })
          }
        } catch (err) {
          set({ loadingEvent: false })
          console.warn('Erro ao buscar evento:', err.message || err)
        }
      },
    }),
    {
      name: 've_terminal',
      partialize: (s) => ({
        terminalId: s.terminalId,
        terminalName: s.terminalName,
        eventId: s.eventId,
      }),
    }
  )
)
