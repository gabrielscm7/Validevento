import { useAuthStore } from '../store/authStore'
import Logo from '../components/Logo'

export default function NoEventScreen() {
  const { user } = useAuthStore()

  return (
    <div className="page">
      <div className="page-body narrow">
        <div className="empty" style={{ paddingTop: 80 }}>
          <Logo withText />
          <div style={{ marginTop: 40 }}>
            <p className="empty-title">Nenhum evento em acesso</p>
            <p className="empty-sub">
              {user?.role === 'validator'
                ? 'Você precisa do link de um evento para abrir a portaria.'
                : 'Você ainda não foi vinculado a nenhum evento. Fale com o administrador.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
