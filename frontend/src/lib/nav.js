/**
 * Resolve a navegação lateral conforme o perfil e o contexto de rota.
 * Retorna seções [{ title, items: [{ to, label, icon, end }] }].
 */
export function resolveEventItems(eventId, role) {
  const items = [
    { to: `/supervisor/${eventId}`, label: 'Visão geral', icon: 'pulse', end: true },
  ]
  if (role === 'admin' || role === 'master') {
    items.push(
      { to: `/admin/eventos/${eventId}/config`, label: 'Configurações', icon: 'settings' },
      { to: `/admin/eventos/${eventId}/equipe`, label: 'Equipe', icon: 'users' },
      { to: `/admin/eventos/${eventId}/lotes`, label: 'Lotes', icon: 'layers' },
      { to: `/admin/eventos/${eventId}/ingressos`, label: 'Ingressos', icon: 'ticket' },
    )
  }
  items.push(
    { to: `/supervisor/${eventId}/portoes`, label: 'Portões', icon: 'door' },
    { to: `/supervisor/${eventId}/relatorio`, label: 'Relatório', icon: 'chart' },
  )
  return items
}

export function eventIdFromPath(pathname) {
  const match = pathname.match(/^\/(?:supervisor|admin\/eventos)\/([0-9a-fA-F-]{36})/)
  return match ? match[1] : null
}

const ADMIN_SECTIONS = ['/config', '/equipe', '/lotes', '/ingressos', '/editar']
const SHARED_SECTIONS = ['/portoes', '/relatorio']

/**
 * Reaproveita a seção atual ao trocar de evento (ex.: /supervisor/A/portoes
 * → /supervisor/B/portoes). Cai para a visão geral quando não há seção.
 */
export function switchEventPath(currentPath, newEventId, role) {
  const match = currentPath.match(/^\/(?:supervisor|admin\/eventos)\/[0-9a-fA-F-]{36}(\/.*)?$/)
  const suffix = match && match[1] ? match[1] : ''

  if (SHARED_SECTIONS.includes(suffix)) return `/supervisor/${newEventId}${suffix}`
  if ((role === 'admin' || role === 'master') && ADMIN_SECTIONS.includes(suffix)) {
    return `/admin/eventos/${newEventId}${suffix}`
  }
  return `/supervisor/${newEventId}`
}

export function resolveNav(pathname, user) {
  const role = user?.role
  const sections = []

  const geral = []
  if (role === 'master') {
    geral.push({ to: '/master', label: 'Painel', icon: 'grid', end: true })
    geral.push({ to: '/master/clientes', label: 'Clientes', icon: 'building' })
    geral.push({ to: '/admin/eventos', label: 'Eventos', icon: 'calendar' })
    geral.push({ to: '/admin/usuarios', label: 'Usuários', icon: 'users' })
  }
  if (role === 'admin') {
    geral.push({ to: '/admin', label: 'Painel', icon: 'grid', end: true })
    geral.push({ to: '/admin/eventos', label: 'Eventos', icon: 'calendar' })
    geral.push({ to: '/admin/usuarios', label: 'Usuários', icon: 'users' })
  }
  if (geral.length) sections.push({ title: 'Geral', items: geral })

  const eventId = eventIdFromPath(pathname)
  if (eventId && (role === 'admin' || role === 'supervisor' || role === 'master')) {
    sections.push({ title: 'Evento', items: resolveEventItems(eventId, role) })
  }

  return sections
}

export default resolveNav
