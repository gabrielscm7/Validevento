const LABELS = {
  master: 'Master',
  admin: 'Admin',
  supervisor: 'Supervisor',
  clientes: 'Clientes',
  eventos: 'Eventos',
  usuarios: 'Usuários',
  config: 'Configurações',
  equipe: 'Equipe',
  lotes: 'Lotes',
  ingressos: 'Ingressos',
  portoes: 'Portões',
  relatorio: 'Relatório',
  novo: 'Novo evento',
  editar: 'Editar',
}

const UUID_RE = /^[0-9a-fA-F-]{36}$/

/**
 * Monta a trilha de navegação a partir da rota.
 * @returns {Array<{ label: string, to: string|null }>}
 */
export function resolveBreadcrumb(pathname, { eventName } = {}) {
  const parts = pathname.split('/').filter(Boolean)
  if (!parts.length) return []

  const items = []
  let cumulative = ''

  parts.forEach((part, i) => {
    cumulative += `/${part}`
    const isLast = i === parts.length - 1
    let label = LABELS[part]
    if (!label && UUID_RE.test(part)) label = eventName || 'Evento'
    if (!label) label = part.charAt(0).toUpperCase() + part.slice(1)

    let to = cumulative
    if (part === 'supervisor') to = null
    if (isLast) to = null

    items.push({ label, to })
  })

  return items
}

export default resolveBreadcrumb
