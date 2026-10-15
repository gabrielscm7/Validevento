import { NavLink } from 'react-router-dom'
import { resolveEventItems } from '../../lib/nav'
import { NavIcon } from './icons'

export function EventTabs({ eventId, role }) {
  if (!eventId || (role !== 'admin' && role !== 'supervisor' && role !== 'master')) return null
  const items = resolveEventItems(eventId, role)

  return (
    <div className="topbar-tabs" role="tablist" aria-label="Seções do evento">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          role="tab"
          className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}
        >
          <NavIcon name={item.icon} size={15} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </div>
  )
}

export default EventTabs
