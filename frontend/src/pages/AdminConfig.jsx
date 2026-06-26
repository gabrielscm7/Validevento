import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useTerminalStore } from '../store/terminalStore'
import { ThemeToggle } from '../components/ThemeToggle'
import UsersTab from '../components/admin/UsersTab'
import BatchesTab from '../components/admin/BatchesTab'
import TicketsTab from '../components/admin/TicketsTab'
import ImportTab from '../components/admin/ImportTab'

const TABS = [
  { id: 'users',   label: '👥 Usuários' },
  { id: 'batches', label: '📦 Lotes' },
  { id: 'tickets', label: '🎫 Ingressos' },
  { id: 'import',  label: '📤 Importar CSV' },
]

export default function AdminConfig() {
  const { user, logout } = useAuthStore()
  const { eventId } = useTerminalStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState('users')

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass border-b px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-muted-foreground hover:text-foreground text-lg flex-shrink-0">←</button>
          <span className="text-xl">🎟️</span>
          <div>
            <h1 className="font-bold text-foreground text-lg leading-tight">Configuração</h1>
            <p className="text-xs text-muted-foreground">Validevento · {user?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={() => { logout(); navigate('/login') }} className="btn-ghost py-1.5 px-2 text-xs">Sair</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6">
        {!eventId && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl px-4 py-3 text-sm text-amber-700 dark:text-amber-300 mb-6">
            Nenhum evento configurado. Execute o seed no backend.
          </div>
        )}

        <div className="flex border-b border-border gap-1 mb-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition-all whitespace-nowrap ${
                tab === t.id ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'users' && <UsersTab eventId={eventId} />}
        {tab === 'batches' && <BatchesTab eventId={eventId} />}
        {tab === 'tickets' && <TicketsTab eventId={eventId} />}
        {tab === 'import' && <ImportTab eventId={eventId} />}
      </div>
    </div>
  )
}
