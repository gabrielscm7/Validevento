import { useEffect, useState } from 'react'
import { listClients } from '../../services/clientsService'
import { useAuthStore } from '../../store/authStore'
import { useScopeStore } from '../../store/scopeStore'

/**
 * Seletor de cliente para o MASTER definir o contexto de operação.
 * Só é renderizado para o perfil master; para os demais retorna null.
 */
export default function TenantSelect({ onChange }) {
  const role = useAuthStore((s) => s.user?.role)
  const { tenantId, setTenant } = useScopeStore()
  const [clients, setClients] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (role !== 'master') return
    listClients()
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch((e) => setError(e?.response?.data?.error || 'Erro ao carregar clientes.'))
  }, [role])

  if (role !== 'master') return null

  return (
    <div className="card card-pad mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="card-title">Cliente em operação</h2>
          <p className="card-sub">
            Selecione o cliente cujos eventos e usuários deseja visualizar e gerenciar.
          </p>
        </div>
        <div className="field" style={{ minWidth: 260 }}>
          <select
            className="select"
            value={tenantId || ''}
            onChange={(e) => {
              const id = e.target.value || null
              const client = clients.find((c) => c.id === id)
              setTenant(id, client?.name || null)
              onChange?.(id)
            }}
          >
            <option value="">— Todos os clientes —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (suspenso)'}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="form-error mt-2">{error}</p>}
    </div>
  )
}
