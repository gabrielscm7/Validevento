import { useTerminalStore } from '../store/terminalStore'
import { getLastEventId } from './lastEvent'

/**
 * Resolve o evento a usar como home para supervisor/validator.
 * Prioridade: user.lastEventId (ex.: resposta do login) → eventId persistido
 * no terminalStore → ve_last_event_id.
 */
function resolveLastEventId(user) {
  if (user?.lastEventId) return user.lastEventId
  const terminalEvent = useTerminalStore.getState().eventId
  return terminalEvent || getLastEventId()
}

/** Home de cada perfil (usada no redirect por perfil insuficiente / pós-login). */
export function homeForRole(user) {
  const role = typeof user === 'string' ? user : user?.role
  if (role === 'master') return '/master'
  if (role === 'admin') return '/admin'
  if (role === 'supervisor') {
    const ev = resolveLastEventId(user)
    return ev ? `/supervisor/${ev}` : null
  }
  if (role === 'validator') {
    const ev = resolveLastEventId(user)
    return ev ? `/terminal/${ev}` : null
  }
  return '/login'
}
