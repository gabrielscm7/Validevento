import { useAuthStore } from '../../store/authStore'
import { useScopeStore } from '../../store/scopeStore'
import TenantSelect from './TenantSelect'

/**
 * Exige que o MASTER selecione um cliente antes de acessar as telas de admin.
 * Para os demais perfis renderiza os filhos diretamente.
 */
export function MasterTenantGate({ children }) {
  const role = useAuthStore((s) => s.user?.role)
  const tenantId = useScopeStore((s) => s.tenantId)

  if (role === 'master' && !tenantId) {
    return (
      <div className="page">
        <div className="page-body narrow" style={{ paddingTop: 60 }}>
          <div className="card card-pad">
            <h1 className="card-title mb-2">Selecione um cliente</h1>
            <p className="card-sub mb-4">
              Como usuário MASTER, escolha o cliente cujos eventos e usuários
              deseja visualizar e gerenciar.
            </p>
            <TenantSelect required />
          </div>
        </div>
      </div>
    )
  }

  return children
}

export default MasterTenantGate
