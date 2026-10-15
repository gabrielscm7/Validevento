# Acesso e controle total do Master

> Documento de referência da mudança entregue na versão **v2.5.0**
> (commit `feat(access): permitir ao master gerenciar usuários e eventos de clientes`).

## 1. Contexto

O sistema é **multi-tenant**: cada cliente (`clients`) possui seus usuários,
eventos, ingressos e logs. Os papéis são:

| Papel | Escopo | `tenant_id` no JWT |
|---|---|---|
| `master` | Global — toda a plataforma | `null` |
| `admin` | Um cliente | definido |
| `supervisor` | Eventos em que está na equipe | definido |
| `validator` | Operação de portaria | definido |

O **master** é o responsável pela manutenção do sistema (suporte, correção de
importações, reabertura de eventos, gestão de acessos de qualquer cliente)
**antes, durante e após** os eventos.

## 2. Problema que motivou a mudança

O **backend já autorizava** o master para as ações necessárias:

- `backend/src/middleware/eventAccess.js` — `role === 'master'` acessa qualquer evento.
- `backend/src/modules/users/users.routes.js` — `requireRole('admin', 'master')`.
- `backend/src/modules/users/users.controller.js` — master opera qualquer tenant.
- `backend/src/modules/events/events.controller.js` — master cria evento com `tenant_id`.

Mesmo assim, o master **não conseguia** gerenciar usuários/eventos pela interface:

1. **Rotas restritas no frontend.** Todas as telas de edição estavam sob
   `allowedRoles={['admin']}` em `frontend/src/App.jsx`. O `PrivateRoute`
   redireciona qualquer perfil fora da lista para `homeForRole` → `/master`.
2. **Tela de cliente somente leitura.** `frontend/src/pages/master/ClientDetail.jsx`
   exibia listas de usuários/eventos sem ações (apenas *purge* de evento encerrado).

Resultado: lacuna **exclusivamente de UI/fluxo** — a API responderia normalmente.

## 3. Solução

### 3.1 Liberação de rotas

`frontend/src/App.jsx`: incluir `master` em `allowedRoles` de `/admin/**`,
`/supervisor/**` e `/terminal/:eventId`.

`backend/src/modules/import/import.routes.js`: `POST /api/import/csv` passa a
aceitar `admin` **e** `master` (único endpoint que ainda bloqueava). O
isolamento de dados é preservado: o import grava usando o `tenant_id` **do
evento**, e o master não informa tenant (a checagem "evento pertence ao cliente"
é ignorada apenas para o master).

### 3.2 Contexto de cliente (tenant) para o master

O master não pertence a um tenant, então a interface precisa saber **qual
cliente** está sendo operado:

- **`frontend/src/store/scopeStore.js`** (novo) — estado do cliente selecionado
  (persistido em `localStorage` como `ve_scope`) e hook `useActiveTenantId()`,
  que devolve o `tenant_id` **somente** para master; para os demais retorna
  `null` (o backend usa o tenant do JWT).
- **`frontend/src/components/master/TenantSelect.jsx`** (novo) — seletor de
  cliente, renderizado apenas para master no topo das telas de admin.

### 3.3 Telas ajustadas

| Arquivo | Ajuste |
|---|---|
| `pages/admin/UsersManager.jsx` | Lista/cria/edita no tenant selecionado; master cria **Administrador**; cotas só com cliente definido; convite bloqueado sem cliente. |
| `pages/admin/EventsList.jsx` | Filtra por `tenant_id` quando master. |
| `pages/admin/AdminHome.jsx` | Idem lista; criação via contexto. |
| `pages/admin/EventForm.jsx` | Envia `tenant_id` no `POST /api/events`; exige cliente selecionado para criar. |
| `pages/admin/TeamManager.jsx` | Candidatos limitados ao tenant **do evento** (não mistura clientes). |
| `pages/master/ClientDetail.jsx` | Botões **Gerenciar eventos**, **Gerenciar usuários** e **Abrir** evento (entram no contexto do cliente). |
| `pages/supervisor/EventDashboard.jsx` | Master pode ativar o evento (`canActivate`). |
| `pages/terminal/Terminal.jsx` | Master vê o atalho "Dashboard". |
| `lib/nav.js`, `components/layout/EventTabs.jsx`, `EventSwitcher.jsx` | Master recebe a navegação de evento (Configurações/Equipe/Lotes/Ingressos) e itens Eventos/Usuários. |
| `components/layout/Sidebar.jsx` | Limpa o contexto de cliente no logout. |

## 4. Fluxo de uso

```
Login (CPF do master)
  └─ /master (Painel)
       └─ Clientes → [cliente]
            ├─ Gerenciar eventos → /admin/eventos  (contexto = cliente)
            ├─ Gerenciar usuários → /admin/usuarios (contexto = cliente)
            └─ Abrir → /admin/eventos/:id → Editar/Configurar/Equipe/Lotes/Ingressos

Atalhos diretos na barra lateral: Eventos e Usuários
  → escolher o cliente no seletor "Cliente em operação"
```

## 5. Garantias e isolamento

- **Admin/supervisor/validator não mudam de comportamento**: `useActiveTenantId()`
  retorna `null` para eles e o backend segue usando o tenant do JWT.
- O master opera **um cliente por vez** via `TenantSelect`; sem cliente
  selecionado, listagens ficam globais (todas as clientes) e **criação** é
  desabilitada até escolher um cliente.
- Importação e criação de eventos usam o **tenant do cliente/evento**, nunca um
  tenant arbitrário escolhido pelo master.

## 6. Verificação

| Suíte | Resultado |
|---|---|
| Backend (`backend: npm test`) | 117/117 |
| Frontend (`frontend: npm test`) | 41/41 |
| Lint (`frontend: npm run lint`) | 0 problemas |
| Build (`frontend: npm run build`) | OK |

## 7. Arquivos alterados

```
backend/src/modules/import/import.routes.js
frontend/src/App.jsx
frontend/src/lib/nav.js
frontend/src/store/scopeStore.js                          (novo)
frontend/src/components/master/TenantSelect.jsx           (novo)
frontend/src/components/layout/EventTabs.jsx
frontend/src/components/layout/EventSwitcher.jsx
frontend/src/components/layout/Sidebar.jsx
frontend/src/pages/admin/AdminHome.jsx
frontend/src/pages/admin/EventForm.jsx
frontend/src/pages/admin/EventsList.jsx
frontend/src/pages/admin/TeamManager.jsx
frontend/src/pages/admin/UsersManager.jsx
frontend/src/pages/master/ClientDetail.jsx
frontend/src/pages/supervisor/EventDashboard.jsx
frontend/src/pages/terminal/Terminal.jsx
```
