import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'
import { setEventId, setTerminalId, getTerminalId } from '../services/localDB'

export const useTerminalStore = create(
  persist(
    (set, get) => ({
      terminalId:   null,
      terminalName: null,
      eventId:      import.meta.env.VITE_EVENT_ID || null,
      loadingEvent: false,
      initialized:  false,

      initTerminal: async () => {
        if (get().initialized) return
        const storedTerminalId = await getTerminalId()
        if (storedTerminalId) {
          set({ terminalId: storedTerminalId, initialized: true })
          return
        }
        const newId = crypto.randomUUID()
        await setTerminalId(newId)
        set({ terminalId: newId, initialized: true })
      },

      setTerminal: async ({ terminalId, terminalName }) => {
        set({ terminalId, terminalName })
        if (terminalId) await setTerminalId(terminalId)
      },

      setEvent: async ({ eventId }) => {
        set({ eventId })
        if (eventId) await setEventId(eventId)
      },

      clear: () =>
        set({ terminalId: null, terminalName: null }),

      isConfigured: () => !!get().terminalId && !!get().eventId,

      ensureEvent: async () => {
        if (get().eventId) return
        if (get().loadingEvent) return
        set({ loadingEvent: true })
        try {
          const { data } = await api.get('/api/events/active')
          await setEvent({ eventId: data.id })
          set({ loadingEvent: false })
          console.log(`Evento detectado: ${data.name} (${data.id})`)
        } catch {
          set({ loadingEvent: false })
          console.warn('Nenhum evento ativo encontrado. Execute npm run seed.')
        }
      },
    }),
    {
      name: 've_terminal',
      partialize: (s) => ({
        terminalId:   s.terminalId,
        terminalName: s.terminalName,
        eventId:      s.eventId,
      }),
    }
  )
)
