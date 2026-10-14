# Plan 009: Corrigir falhas críticas de segurança e isolamento multi-tenant

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 92ddef8..HEAD -- backend/src backend/src/__tests__ frontend/src frontend/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED-HIGH (muda autorização em runtime; exige atualização de fixtures)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `92ddef8`, 2026-10-14

## Why this matters

A revisão completa do projeto encontrou falhas críticas de isolamento
multi-tenant e de escalação de privilégio:

1. `POST /api/admin/reset` permite a **qualquer admin** apagar todos os
   dados de **todos os tenants** (e, com `event_id`, sem checagem de tenant).
2. `PUT /api/users/:id` aceita `role`/`email_verified`, permitindo um admin
   **promover-se a si mesmo** e burlar a RN-08 (“somente o Master cria admins”).
3. `/api/batches` (legado) permite a um admin **ler/editar/excluir lotes de
   outro tenant**.
4. `/api/events/active` retorna o evento ativo mais recente **de toda a base**,
   vazando dados entre clientes.
5. `/api/validation/*` e `/api/sync/*` **não passam por `eventAccess`**: um
   validador pode operar qualquer evento do tenant, mesmo fora da `event_team`
   e em evento não ativo.
6. XSS armazenado no preview do relatório (`marked` + `dangerouslySetInnerHTML`).
7. Ingresso master bloqueia portão fechado, divergindo do resto do sistema.
8. `forgot-password`/`resend-verification` usam lookup de e-mail case-sensitive.
9. Política de senha mínima existe só no frontend.

Escopo aprovado com o usuário: **itens 1–9** (críticos + altos). Decisões
tomadas: **remover** os módulos legados `admin` e `/api/batches`; **impor**
`eventAccess` em validação/sync; mitigar XSS **no backend e no frontend**
(DOMPurify). As rotas públicas por slug (`/api/terminal/:slug/*`) **não** são
afetadas (têm autorização própria).

## Current state (referências no commit `92ddef8`)

**`backend/src/app.js`** (imports e mounts legados):
```js
17: const adminRoutes      = require('./modules/admin/admin.routes');
18: const usersRoutes      = require('./modules/users/users.routes');
19: const clientsRoutes    = require('./modules/clients/clients.routes');
20: const batchesRoutes    = require('./modules/batches/batches.routes');
...
154: app.use('/api/admin',      adminRoutes);
...
157: app.use('/api/batches',    batchesRoutes);
```

**`backend/src/modules/users/users.service.js`** (`updateUser`):
```js
134: async function updateUser(id, tenantId, fields) {
135:   const allowed = ['name', 'email', 'role', 'active', 'email_verified'];
```

**`backend/src/middleware/eventAccess.js`**: exporta `{ eventAccess, requireEventRole }`;
`eventAccess` lê `req.params.eventId || req.params.id` e usa `req.user`.

**`backend/src/modules/validation/validation.routes.js`**:
```js
9: router.use(authMiddleware);
```
**`backend/src/modules/sync/sync.routes.js`**:
```js
8: router.use(authMiddleware);
```

**`backend/src/modules/events/events.service.js`** (`getActiveEvent`, legado):
```js
246:   getActiveEvent: async () => {
247:     const result = await db.query(
248:       `SELECT id, name, date, location, capacity
249:        FROM events
250:        WHERE active = true
251:        ORDER BY created_at DESC
252:        LIMIT 1`
253:     );
```
**`backend/src/modules/events/events.controller.js`** (`getActive`): chama
`eventsService.getActiveEvent()` sem tenant.

**`backend/src/modules/reports/reports.service.js`** (`mdTable`):
```js
85: function mdTable(headers, rows) {
86:   const esc = (v) => String(v === undefined || v === null ? '' : v).replace(/\|/g, '/');
```

**`frontend/src/pages/supervisor/ReportsPanel.jsx`**:
```js
79:   const mdHtml = useMemo(() => {
80:     if (!md) return ''
81:     const result = marked.parse(md)
82:     return typeof result === 'string' ? result : ''
83:   }, [md])
...
138:                 dangerouslySetInnerHTML={{ __html: mdHtml }}
```

**`backend/src/modules/invitations/invitations.service.js`** (`useMasterTicket`):
```js
202:     let gateId = null;
203:     if (terminalId) {
...
212:       if (terminal?.gate_id) {
213:         if (!terminal.opened_at || terminal.closed_at) {
214:           throw apiError(422, 'gate_not_open', 'O portão selecionado está fechado. Escolha outro portão.');
215:         }
216:         gateId = terminal.gate_id;
217:       }
```

**`backend/src/modules/auth/auth.service.js`**:
- `forgotPassword` linha 156: `'SELECT id, name, email FROM users WHERE email = $1'`.
- `resendVerification` linha 223: `SELECT id, name, email, email_verified, active FROM users WHERE email = $1`.
- `verifyEmail` (113-144) e `resetPassword` (179-210) não validam tamanho de senha.

**`backend/src/__tests__/helpers.js`**: `createEvent` usa `over.status || 'draft'`
(linha ~192); não há helper para inserir em `event_team`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Subir DB de teste | `docker compose up -d db` (na raiz) | container healthy |
| Testes backend | `cd backend && npm test` | todas as suítes passam |
| Lint frontend | `cd frontend && npm run lint` | 0 erros |
| Testes frontend | `cd frontend && npm test` | todos passam |
| Build frontend | `cd frontend && npm run build` | build OK |
| Instalar DOMPurify | `cd frontend && npm install dompurify` | adiciona em `package.json` |

## Scope

**In scope**:
- `backend/src/app.js`
- `backend/src/modules/admin/` (remover)
- `backend/src/modules/batches/batches.routes.js` (remover) e funções legadas em `batches.controller.js`/`batches.service.js`
- `backend/src/modules/users/users.service.js`, `users.controller.js`
- `backend/src/middleware/eventAccess.js`
- `backend/src/modules/validation/validation.routes.js`
- `backend/src/modules/sync/sync.routes.js`
- `backend/src/modules/events/events.service.js`, `events.controller.js`
- `backend/src/modules/reports/reports.service.js`
- `backend/src/modules/invitations/invitations.service.js`
- `backend/src/modules/auth/auth.service.js`
- `backend/src/__tests__/**`
- `frontend/src/pages/supervisor/ReportsPanel.jsx`
- `frontend/package.json` (+ lock)

**Out of scope**:
- Migrations (nenhuma mudança de schema é necessária).
- Rotas públicas por slug `/api/terminal/:slug/*`.
- Itens médios/baixos da revisão (PWA cache, `ticket_code` único por evento,
  `duplicate_action='block'`, nginx/docker-compose, `forcSync`, CI de testes do
  frontend). Podem virar o plano 010.
- Alterações em produção (Railway/variáveis) — exigem aval do usuário.

## Git workflow

- Branch: `fix/security-multitenant`
- Commits sugeridos (um por fase): `fix(security): remove legacy admin/batches routes`,
  `fix(security): prevent privilege escalation on user update`,
  `fix(security): enforce event access on validation and sync`,
  etc. Não fazer push sem pedido explícito.

## Steps

### Fase 1 — Remover módulos legados (itens 1 e 3)

**Step 1.1 — Remover `/api/admin`**
- Em `backend/src/app.js`, remover a linha 17 (`const adminRoutes = ...`) e a
  linha 154 (`app.use('/api/admin', adminRoutes);`).
- Excluir o diretório `backend/src/modules/admin/`.
- Verificar inexistência de referências: `grep -rn "admin.routes\|admin.controller\|admin.service" backend/src` deve retornar vazio (fora de comentários).

**Step 1.2 — Remover `/api/batches` legado**
- Em `backend/src/app.js`, remover a linha 20 (`const batchesRoutes = ...`) e a
  linha 157 (`app.use('/api/batches', batchesRoutes);`).
- Excluir `backend/src/modules/batches/batches.routes.js`.
- Em `batches.controller.js`: remover `list`, `create`, `update`, `remove` e
  removê-los dos `module.exports` (manter `listEventBatches`, `createEventBatch`,
  `updateEventBatch`, `deleteEventBatch`).
- Em `batches.service.js`: remover `listBatches`, `createBatch`, `updateBatch`,
  `deleteBatch` e removê-los dos exports (manter os `*EventBatch*`).
- Verificar que o roteador aninhado `batches.event.routes.js` continua funcionando.

**Verify**: `git grep -n "batches.routes" backend/src` vazio; `npm test` do
backend ainda verde (excluindo os ajustes de fixtures da Fase 6).

**Step 1.3 — Confirmar que os endpoints sumiram**
- `GET /api/admin/reset` → 404; `GET /api/batches` → 404 (coberto por teste novo
  na Fase 6).

### Fase 2 — Bloquear escalação de privilégio (item 2)

**Step 2.1 — Restringir campos de `updateUser`**
- Em `users.service.js` (`updateUser`, linha 135), trocar:
  `const allowed = ['name', 'email', 'role', 'active', 'email_verified'];`
  por `const allowed = ['name', 'active'];`.
- A troca de e-mail passa a ocorrer apenas por `PATCH /api/users/:id/profile`
  (que já reseta `email_verified` e gera novo `email_token`).

**Step 2.2 — Admin não altera outro admin**
- `users.service.js::updateUser` deve receber a role do solicitante. Alterar a
  assinatura para `updateUser(id, tenantId, fields, requesterRole)`.
- Antes do UPDATE, buscar a role do alvo (respeitando o tenant) e retornar
  `403 profile_edit_forbidden` se `requesterRole === 'admin'` e alvo `role === 'admin'`.
- Ajustar `users.controller.js::update` (linhas 45-55) para passar `req.user.role`.

**Verify**: teste novo (Fase 6) envia `PUT /api/users/:id` com `{ role: 'admin' }`
e confirma que a role permanece `validator`; admin tentando alterar outro admin
recebe 403.

### Fase 3 — Autorização de evento em validação/sync (item 5)

**Step 3.1 — Criar middleware que resolve `event_id` do input**
- Em `backend/src/middleware/eventAccess.js`, adicionar e exportar:
```js
async function eventAccessFromInput(req, res, next) {
  const eventId = (req.body && req.body.event_id) || (req.query && req.query.event_id);
  if (!eventId) {
    return res.status(400).json({ error: 'invalid_event_id', details: 'event_id é obrigatório.' });
  }
  req.params.eventId = eventId; // reaproveita a lógica existente do eventAccess
  return eventAccess(req, res, next);
}
module.exports = { eventAccess, requireEventRole, eventAccessFromInput };
```
- Não alterar a lógica interna de `eventAccess` (já aplica `event_team`, status
  restrito para validator/supervisor, e acesso global para master).

**Step 3.2 — Aplicar nas rotas de validação**
- Em `validation.routes.js`, após `router.use(authMiddleware);` (linha 9),
  importar `{ eventAccessFromInput }` e adicionar `router.use(eventAccessFromInput);`.
- Todas as rotas já usam `event_id` (query em `lookup`/`search`; body em
  `qrcode`/`manual`/`checkout`/`master`).

**Step 3.3 — Aplicar nas rotas de sync**
- Em `sync.routes.js`, após `router.use(authMiddleware);` (linha 8), adicionar
  `router.use(eventAccessFromInput);`.
- `snapshot` usa `event_id` na query; `logs`/`heartbeat` no body.

**Verify**: validador sem `event_team` → 403 `not_in_event_team`; evento `draft`
→ 403 “Este evento não está ativo.”; admin/master continuam 200.

> **Atenção de comportamento**: este é o passo que exige atualizar as fixtures
> (Fase 6). Não rodar a suíte completa antes de ajustar os testes.

### Fase 4 — `/api/events/active` por tenant (item 4)

**Step 4.1 — Filtrar por tenant**
- `events.service.js::getActiveEvent` passa a receber `tenantId`:
```js
getActiveEvent: async (tenantId) => {
  const result = await db.query(
    `SELECT id, name, date, location, capacity
     FROM events
     WHERE active = true AND ($1::uuid IS NULL OR tenant_id = $1)
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId || null]
  );
  return result.rows[0] || null;
},
```
- `events.controller.js::getActive` (linhas 133-142) chama
  `eventsService.getActiveEvent(req.tenantId)`.
- Master (`req.tenantId === null`) mantém comportamento global.

**Verify**: teste novo garante que um validador do tenant A não recebe o evento
ativo do tenant B.

### Fase 5 — XSS no relatório (item 6)

**Step 5.1 — Escape no backend**
- Em `reports.service.js::mdTable` (linha 86), endurecer o escape:
```js
const esc = (v) => String(v === undefined || v === null ? '' : v)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\|/g, '/')
  .replace(/`/g, "'");
```
- Escapar também o `event.name` interpolado na linha do título (`## Relatório...`
  / `# Relatório de Evento — ${event.name}`), usando um helper `escInline`.

**Step 5.2 — Sanitizar no frontend**
- `cd frontend && npm install dompurify`.
- Em `ReportsPanel.jsx`, importar `DOMPurify from 'dompurify'` e trocar o
  `useMemo` (linhas 79-83) para:
```js
const mdHtml = useMemo(() => {
  if (!md) return ''
  const parsed = marked.parse(md)
  const raw = typeof parsed === 'string' ? parsed : ''
  return DOMPurify.sanitize(raw)
}, [md])
```

**Verify**: teste de backend cria ticket com `display_name = '<img src=x onerror=alert(1)>'`
e confirma que o MD não contém `<img` cru; `npm run lint` e `npm run build` OK.

### Fase 6 — Portão fechado, e-mail e senha (itens 7, 8, 9)

**Step 6.1 — Ingresso master aceita portão fechado**
- Em `invitations.service.js::useMasterTicket` (linhas 202-217), remover o
  `throw apiError(422, 'gate_not_open', ...)`; quando o portão estiver fechado,
  manter `gateId = null` e seguir (mesmo comportamento de
  `validation.service.resolveGate`).

**Step 6.2 — Lookup de e-mail case-insensitive**
- `auth.service.js:156` (`forgotPassword`): `WHERE LOWER(email) = LOWER($1)`.
- `auth.service.js:223` (`resendVerification`): idem.

**Step 6.3 — Política de senha mínima no backend**
- Em `auth.service.js`, adicionar:
```js
function assertStrongPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw httpError(422, 'weak_password', 'A senha deve ter no mínimo 8 caracteres.');
  }
}
```
- Aplicar em `verifyEmail` (após validar token, antes de `hashPassword`) e em
  `resetPassword` (após validar token).

**Verify**: testes novos — senha `123` → 422 `weak_password`; e-mail com
maiúsculas encontra o usuário em `forgot-password`/`resend-verification`.

### Fase 7 — Atualizar fixtures e adicionar regressões

**Step 7.1 — Helpers de teste**
- Em `backend/src/__tests__/helpers.js`, adicionar:
```js
async function addTeamMember(eventId, userId, roleOverride = null) {
  await pool.query(
    `INSERT INTO event_team (event_id, user_id, role_override)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id, user_id) DO UPDATE SET role_override = EXCLUDED.role_override`,
    [eventId, userId, roleOverride]
  );
}
```
- Exportar o helper. Considerar também um helper `createActiveEvent`.

**Step 7.2 — Ajustar suítes afetadas pela Fase 3**
- Suítes que chamam `/api/validation` ou `/api/sync`:
  `validation.test.js`, `sync.test.js`, `reentry.test.js`, `invitations.test.js`,
  `dashboard.test.js`, `reports.test.js`, `gates.test.js`.
- Para cada uma: garantir que o evento esteja `active` (via
  `PATCH /api/events/:id/status` com admin ou criando com `status: 'active'`) e
  que o validador/supervisor usado nas chamadas esteja em `event_team`
  (`addTeamMember`).
- Manter os testes de isolamento existentes intactos.

**Step 7.3 — Novos testes de regressão**
- `admin`/`batches`: `GET /api/admin/reset` e `GET /api/batches` → 404.
- `users`: `PUT /api/users/:id` com `{ role: 'admin' }` não altera a role;
  admin não altera admin (403).
- `events`: `/api/events/active` não vaza evento de outro tenant.
- `validation`/`sync`: sem `event_team` → 403; evento `draft` → 403.
- `reports`: `display_name` malicioso não gera HTML cru no MD.
- `auth`: senha fraca → 422; e-mail com caixa alta funciona no reset/reenvio.

**Verify**: `cd backend && npm test` → todas as suítes verdes.

## Test plan

Manual/automático:
1. `docker compose up -d db` (raiz).
2. `cd backend && npm test` — suíte completa verde.
3. `cd frontend && npm run lint && npm test && npm run build`.
4. Smoke manual (dev): logar como validador sem equipe e confirmar 403; adicionar
   à equipe e validar; abrir preview do relatório com nome malicioso e confirmar
   que não executa script.

## Done criteria

ALL must hold:
- [ ] `GET /api/admin/*` e `/api/batches` retornam 404; módulos/arquivos legados removidos.
- [ ] `PUT /api/users/:id` não altera `role`/`email_verified`; admin não altera admin.
- [ ] `/api/validation/*` e `/api/sync/*` exigem `event_team` + evento ativo; slug intacto.
- [ ] `/api/events/active` respeita `req.tenantId`.
- [ ] Relatório sem HTML injetável (escape backend + DOMPurify).
- [ ] Master não bloqueia por portão fechado; e-mail case-insensitive; senha mínima no backend.
- [ ] Fixtures atualizadas; novas regressões adicionadas.
- [ ] `npm test` backend e lint/test/build frontend verdes.
- [ ] `git status` sem arquivos fora do escopo.
- [ ] `plans/README.md` atualizado.

## STOP conditions

Stop and report back (do not improvise) if:
- As referências de linha/“Current state” não baterem com o código atual.
- A imposição de `eventAccess` quebrar um fluxo legítimo não previsto (ex.: terminal
  operando por tenant sem `event_team`) — nesse caso, confirmar política com o usuário.
- Qualquer passo de remoção revelar consumidor não mapeado (frontend/teste) das rotas legadas.
- Uma verificação falhar duas vezes após tentativa razoável de correção.

## Maintenance notes

- A autorização por `event_team` é a política oficial: novos endpoints de evento
  devem reutilizar `eventAccess`/`eventAccessFromInput`.
- Não reintroduzir endpoints de manutenção destrutivos sem `master` + tenant.
- Ao evoluir relatórios, manter o escape defensivo no backend mesmo com DOMPurify
  no frontend (o arquivo `.md` também é baixado e pode ser aberto fora do app).
