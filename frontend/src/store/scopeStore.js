import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuthStore } from './authStore'

/**
 * Contexto de cliente selecionado pelo MASTER.
 *
 * O master não pertence a um tenant (tenant_id = null no JWT). Para gerenciar
 * usuários e eventos de um cliente ele precisa indicar qual tenant está
 * operando. Esse "cliente ativo" é mantido aqui e reenviado como `tenant_id`
 * nas requisições (as telas de admin leem via `useActiveTenantId`).
 */
export const useScopeStore = create(
  persist(
    (set) => ({
      tenantId: null,
      tenantName: null,
      setTenant: (tenantId, tenantName = null) => set({ tenantId, tenantName }),
      clearTenant: () => set({ tenantId: null, tenantName: null }),
    }),
    {
      name: 've_scope',
      partialize: (s) => ({ tenantId: s.tenantId, tenantName: s.tenantName }),
    }
  )
)

/**
 * Tenant efetivo para as requisições:
 *  - master → cliente selecionado (ou null = sem filtro / todos);
 *  - admin/supervisor/validator → null (o backend usa o tenant do JWT).
 */
export function useActiveTenantId() {
  const role = useAuthStore((s) => s.user?.role)
  const tenantId = useScopeStore((s) => s.tenantId)
  return role === 'master' ? tenantId : null
}

export default useScopeStore
