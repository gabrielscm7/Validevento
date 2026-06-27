import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../services/api'
import { setEventId } from '../services/localDB'

export const useTerminalStore = create(
  persist(
    (set, get) => ({
      terminalId:   null,
      terminalName: null,
      eventId:      import.meta.env.VITE_EVENT_ID || null,
      eventSalt:    null,
      loadingEvent: false,

      setTerminal: ({ terminalId, terminalName }) =>
        set({ terminalId, terminalName }),

      setEvent: ({ eventId, eventSalt }) =>
        set({ eventId, eventSalt }),

      clear: () =>
        set({ terminalId: null, terminalName: null, eventSalt: null }),

      isConfigured: () => !!get().terminalId && !!get().eventId,

      /** Busca evento ativo na API se VITE_EVENT_ID não foi configurado */
      ensureEvent: async () => {
        if (get().eventId && get().eventSalt) return
        if (get().loadingEvent) return
        set({ loadingEvent: true })
        try {
          const { data } = await api.get('/api/events/active')
          set({ eventId: data.id, eventSalt: data.salt, loadingEvent: false })
          await setEventId(data.id)
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
        eventSalt:    s.eventSalt,
      }),
    }
  )
)
