import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useUIStore } from '../../store/uiStore'

export function AppShell() {
  const location = useLocation()
  const { sidebarOpen, closeSidebar, collapsed } = useUIStore()

  useEffect(() => { closeSidebar() }, [location.pathname, closeSidebar])

  return (
    <div className={`app-layout ${collapsed ? 'is-collapsed' : ''} ${sidebarOpen ? 'is-open' : ''}`}>
      <Sidebar />
      <button
        type="button"
        className="snav-scrim"
        aria-label="Fechar menu"
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={closeSidebar}
      />
      <div className="app-main">
        <div className="route-view" key={location.pathname}>
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default AppShell
