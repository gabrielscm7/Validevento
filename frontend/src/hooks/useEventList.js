import { useEffect, useState } from 'react'
import { listEvents } from '../services/eventsService'

let cache = null
let inflight = null

/**
 * Lista de eventos do tenant, carregada sob demanda e cacheada em módulo
 * (o TopBar remonta a cada navegação, então o cache evita recarregar).
 */
export function useEventList(enabled = true) {
  const [events, setEvents] = useState(cache)

  useEffect(() => {
    if (!enabled || cache) return
    if (!inflight) {
      inflight = listEvents()
        .then((data) => { cache = Array.isArray(data) ? data : []; return cache })
        .catch(() => { cache = []; return cache })
        .finally(() => { inflight = null })
    }
    let mounted = true
    inflight.then((data) => { if (mounted) setEvents(data) })
    return () => { mounted = false }
  }, [enabled])

  return events
}

export function invalidateEventList() {
  cache = null
}

export default useEventList
