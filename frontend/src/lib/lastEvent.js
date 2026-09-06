// Persistência do último evento acessado pelo usuário (para redirecionamento
// por perfil). O terminalStore também guarda eventId no IndexedDB/zustand.
const KEY = 've_last_event_id'

export function getLastEventId() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setLastEventId(eventId) {
  if (!eventId) return
  try {
    localStorage.setItem(KEY, String(eventId))
  } catch { /* ignore */ }
}

export function clearLastEventId() {
  try {
    localStorage.removeItem(KEY)
  } catch { /* ignore */ }
}
