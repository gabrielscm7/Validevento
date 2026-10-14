import { useEffect } from 'react'
import { useEventStore } from '../store/eventStore'

const inflight = new Map()

/**
 * Garante que o evento do contexto de rota esteja carregado no eventStore
 * (fonte única usada pela sidebar, breadcrumb e abas). Evita requisições
 * duplicadas enquanto uma está em andamento.
 */
export function useCurrentEvent(eventId) {
  const activeEvent = useEventStore((s) => s.activeEvent)

  useEffect(() => {
    if (!eventId) return
    if (useEventStore.getState().activeEvent?.id === eventId) return
    if (inflight.has(eventId)) return

    const promise = useEventStore.getState().loadEvent(eventId)
      .catch(() => {})
      .finally(() => inflight.delete(eventId))
    inflight.set(eventId, promise)
  }, [eventId, activeEvent])

  return activeEvent?.id === eventId ? activeEvent : null
}

export default useCurrentEvent
