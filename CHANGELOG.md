# Changelog — Validevento

## v2.1.0 — Multi-tenant SaaS · Fase 2 — Gestão de evento e ingressos (2026-09-06)

### Resumo

Gestão completa do ciclo de vida do evento: criação/configuração, equipe
designada, lotes e ingressos, ingressos de emergência (master + convite avulso
+ liberação em lista), portões com auditoria de abertura/fechamento e validação
com checkout e reentrada configuráveis por evento.

### 🗄️ Banco de dados (migration `backend/migrations/004_phase2.sql`)

- `entry_logs`: coluna `beneficiary` (nome digitado no uso do ingresso master)
  e `ticket_id` passa a aceitar `NULL` (uso master grava log sem ticket).
- `batches`: coluna `description` (descrição textual do lote).
- Migração incremental e idempotente (`ADD COLUMN IF NOT EXISTS` /
  `ALTER COLUMN ... DROP NOT NULL`) — não altera estruturas da Fase 1.

### ✨ Novo: Gestão de eventos (`modules/events`)

- `GET /api/events` (lista com resumo e filtro por status) e `POST /api/events`
  (admin/master) — criação já embute o `event_config` padrão.
- `GET /api/events/:id` com estatísticas (ingressos, validados, terminais
  ativos, portões), `PUT /api/events/:id` e `PATCH /api/events/:id/status`.
- Máquina de estados: `draft → active | closed` e `active → closed`; evento
  fechado é imutável (`422 event_closed`).
- Auditoria: `event_created`, `event_updated`, `event_status_changed`.
- Rota legada `GET /api/events/active` preservada (compatibilidade v1).

### ✨ Novo: Configuração de evento (`modules/event-config`)

- `GET/PUT /api/events/:id/config` (qrcode_field, manual_fields,
  checkout_enabled, reentry_mode, duplicate_action, master_ticket_enabled,
  métricas e formatos de exportação).
- Bloqueio de edição de `checkout_enabled`/`reentry_mode` em evento fechado.
- `PATCH /api/events/:id/config/checkout` — ativação em tempo real pelo
  supervisor (apenas com evento ativo). Auditoria: `event_config_updated`,
  `checkout_toggled`.

### ✨ Novo: Equipe do evento (`modules/event-team` + `middleware/eventAccess.js`)

- `GET/POST /api/events/:id/team` e `DELETE /api/events/:id/team/:userId`, com
  `role_override` e validação de mesmo tenant.
- Remoção bloqueada com evento ativo e usuário online no terminal
  (`422 user_online`).
- **`eventAccess.js`**: libera membros da equipe e admin/master do tenant em
  todos os endpoints de `:eventId` (`403 not_in_event_team` quando aplicável).

### ✨ Novo: Lotes e ingressos (`modules/batches` + `modules/tickets`)

- Lotes por evento (`GET/POST/PUT/DELETE /api/events/:id/batches`) com
  ocupação; edição bloqueada com ingressos validados e exclusão bloqueada com
  qualquer ingresso no lote. Rota v1 `/api/batches` mantida.
- `GET /api/events/:id/tickets` (paginação + filtros) e
  `PATCH .../block` / `.../unblock` com auditoria (`ticket_blocked`,
  `ticket_unblocked`).

### ✨ Novo: Ingressos de emergência (`modules/invitations`)

- Ingresso master por evento: `GET/POST/DELETE /api/events/:id/master-ticket`
  (upsert, `max_uses` opcional — `null` = ilimitado; desativação sem exclusão).
- `POST /api/validation/master` — uso registrado com beneficiário, contador e
  limite (`422 master_ticket_limit_reached`).
- Convite avulso (`POST /api/events/:id/invitations`) — origem `cortesia`,
  utilizável imediatamente.
- Liberação em lista (`POST /api/events/:id/invitations/bulk`, CSV) — origem
  `liberacao_especial`.
- Ambos respeitam a cota de ingressos do tenant (`422 quota_exceeded`).
- Auditoria: `master_ticket_created/deactivated`, `invitation_created`,
  `bulk_invitation_created`.

### ✨ Novo: Gestão de portões (`modules/gates`)

- `GET/POST /api/events/:id/gates` e `PATCH .../open` / `.../close` com
  timestamp e operador registrados.
- Erros `422 gate_already_open` e `422 gate_not_open`.
- Auditoria: `gate_created`, `gate_opened`, `gate_closed`.

### 🔄 Validação com checkout e reentrada (`modules/validation`)

- `POST /api/validation/checkout` — registra saída no ticket e no entry_log;
  erros `checkout_disabled`, `not_checked_in`, `already_checked_out`.
- `reentry_mode` aplicado no check-in (QRCode e manual):
  - `none`: segunda leitura → `duplicate` (com `warning` se `duplicate_action=warn`);
  - `free`: nova entrada autorizada (`reentry: true`);
  - `conditioned`: reentrada apenas após checkout registrado.
- Correção do BUG-01 mantida (duplicata nunca retorna `authorized`).

### 🧪 Testes

- **40 testes / 10 suítes** (Jest + Supertest) — Fase 1 intacta + novas suítes:
  `events`, `config`, `reentry`, `invitations`, `gates` e `T-quota-2` em
  `quota.test.js`.

---

## v2.0.0 — Multi-tenant SaaS · Fase 1 — Fundação multi-tenant (2026-09-05)

> **Nota de versionamento:** a antiga versão `v2.0.0` (linha legada — portaria
> de **evento único**) foi renomeada para **`v2.0.0-beta`** — ver seção abaixo.
> A partir desta data, `v2.0.0` designa o **SaaS multi-tenant** descrito em
> `Docs/PRD-validevento-v2.md` e `Docs/SPEC-validevento-v2.md`.

### Resumo

Evolução do validador de portaria de uso próprio para um SaaS multi-tenant:
correções obrigatórias da v1 (BUG-01 a BUG-05), schema v2 (tenants,
configuração de evento, equipe, portões, ingresso master e auditoria), módulo
de clientes (master only), autenticação por CPF com verificação de e-mail e
isolamento por tenant em todas as queries.

### 🐛 Correções da v1 (obrigatórias)

- **BUG-01** — `validation.service.js`: segunda validação de um ingresso já
  `validated` retornava `authorized`. Corrigido para retornar
  `{ status: 'duplicate', first_entry_at }` (fluxos QRCode e manual).
- **BUG-02** — CORS: origem passa a vir de `CORS_ORIGIN`; remoção do fallback
  `*` em produção (`env.js` e `.env.example`).
- **BUG-03** — Importação aceita MIME genérico de browsers mobile
  (`text/plain`, `application/octet-stream`) quando a extensão do arquivo é
  válida (`.csv/.xlsx/.xls/.json/.xml`).
- **BUG-05** — `docker-compose.yml`: ambiente dev completo (db com healthcheck
  + backend `:3000` + frontend `:5173`) com hot-reload por volumes.

### 🗄️ Banco de dados (migration `backend/migrations/003_v2_schema.sql`)

- Novas tabelas: `clients`, `event_config`, `event_team`, `gates`,
  `master_tickets`, `audit_logs`.
- Colunas adicionadas:
  - `users`: `tenant_id` (nullable p/ master), `cpf_hash`, `cpf_lookup_hash`
    (UNIQUE), `email_verified`, `email_token`, `email_token_exp`; `password_hash`
    deixou de ser NOT NULL (ativação por e-mail).
  - `events`: `tenant_id`, `expected_start`, `responsible[]`, `status`.
  - `tickets`: `tenant_id`, `origin`, `checkout_at`.
  - `entry_logs`: `tenant_id`, `checkout_at`.
- Índices de tenant/busca conforme SPEC seção 2.2.
- **Backfill automático**: registros legados da v1 são vinculados ao cliente
  "Cliente Legado v1" (`legado@validevento.com`) antes da aplicação de
  `tenant_id NOT NULL`.
- `run.js` passou a ordenar migrations por prefixo numérico
  (`01 → 02 → 003 → 03`).

### ✨ Novo: Módulo de Clientes (master only)

- `GET/POST /api/clients`, `GET/PUT /api/clients/:id`,
  `PATCH /api/clients/:id/suspend`, `PATCH /api/clients/:id/activate` e
  `GET /api/clients/:id/usage` (uso atual vs. cotas).
- Suspensão bloqueia o login de todos os usuários do tenant imediatamente.

### 🔐 Novo: Autenticação por CPF + verificação de e-mail

- `POST /api/auth/login` com CPF (com ou sem formatação) + senha; JWT com
  validade de 24h. Lookup por `cpf_lookup_hash` (SHA-256 + salt).
- Criação de usuário (`POST /api/users`) dispara e-mail de ativação via Resend
  (token 48h); usuário nasce sem senha e sem `email_verified`.
- `POST /api/auth/verify-email`, `POST /api/auth/forgot-password` e
  `POST /api/auth/reset-password` (token de recuperação expira em 1h).
- Controle de cotas por tenant (`422 quota_exceeded` com `used`/`max`).
- Middlewares: verificação de tenant ativo a cada requisição autenticada
  (`tenant_suspended`) e gravação em `audit_logs`.
- Novos `utils/hash.js` (lookup + bcrypt 12) e `utils/email.js` (Resend).
- Isolamento por `tenant_id` nas queries de validation, import e sync.

### ⚙️ Outros

- `GET /health` para keep-alive (Railway Hobby / cron-job.org).
- `.env.example` com `RESEND_API_KEY`, `CPF_LOOKUP_SALT` e `FRONTEND_URL`.

### 🧪 Testes

- Testes automatizados com **Jest + Supertest** (19 testes/5 suítes):
  `auth`, `clients`, `import` (inclui BUG-03), `validation` (inclui BUG-01) e
  `quota`.

---

## v2.0.0-beta — 2026-06-27 · Concorrência e Resiliência (legado — evento único)

> Renomeado de "v2.0.0". Pertence à linha **legada pré-SaaS** (portaria de
> evento único), liberando `v2.0.0` para o SaaS multi-tenant.

### Resumo

Correção do erro crítico 500 ao validar QRCode (`entry_logs_terminal_id_fkey`) e implementação de row-level locking para suportar validações simultâneas sem duplicatas. O sistema agora tolera terminais desconhecidos e garante atomicidade em ambientes multi-terminal.

---

### 🐛 Bugs Corrigidos

#### CRÍTICO: Erro 500 "Request failed with status code 500" ao validar QRCode
- **Sintoma**: Tela vermelha com "ERRO" e mensagem `Request failed with status code 500` ao escanear qualquer QRCode pelo terminal
- **Causa raiz**: O frontend gera um UUID v4 para o terminal (`crypto.randomUUID()`) e envia como `terminal_id` na requisição de validação. Esse UUID nunca era registrado na tabela `terminals` do PostgreSQL antes da validação. Ao inserir o `entry_log` com `terminal_id` desconhecido, a foreign key `entry_logs_terminal_id_fkey` rejeitava a operação → PostgreSQL retornava erro → controller respondia HTTP 500
- **Correção**: Função `ensureTerminal()` adicionada em `validation.service.js` — faz UPSERT automático do terminal (`INSERT ... ON CONFLICT (id) DO UPDATE`) antes de qualquer `entry_log` ser inserido. Se o `terminal_id` não for um UUID válido ou for `null`, envia `NULL` (não viola FK). Mesma correção aplicada em `sync.service.js` para o endpoint `/api/sync/logs`
- **Arquivos**: `validation.service.js:4-15,45,69`, `sync.service.js:27-43`

#### ALTO: Race condition — ingresso validado duas vezes em chamadas simultâneas
- **Sintoma**: Dois terminais validando o mesmo ticket ao mesmo tempo retornavam `authorized` para ambos
- **Causa raiz**: A query `SELECT ... FROM tickets WHERE ...` no `validation.service.js` não travava a linha. Com duas transações concorrentes, ambas liam `status = 'active'` antes de qualquer uma executar `UPDATE`, resultando em duas entradas autorizadas para o mesmo ingresso
- **Correção**: Adicionada cláusula `FOR UPDATE` nas queries `SELECT` de `validateQRCode()` e `validateManual()`. O PostgreSQL agora trava a linha do ticket no início da transação, forçando a segunda requisição a aguardar o `COMMIT` da primeira — ao ler novamente, o status já estará `validated` e retornará `duplicate`
- **Arquivo**: `validation.service.js:31,101`

---

### 🔧 Melhorias de Infraestrutura

#### Pool de conexões
- PostgreSQL `max: 20` conexões no pool suporta até 20 validações simultâneas
- Cada validação usa `pool.connect()` → `BEGIN` → operações → `COMMIT`/`ROLLBACK` → `client.release()`, garantindo isolamento por transação

---

### 📊 Testes Realizados

| Cenário | Resultado |
|---------|-----------|
| QRCode válido, terminal novo (nunca registrado) | `authorized` ✅ |
| QRCode inválido (não UUID v4) | `not_found` (200, sem erro) |
| 2 terminais validando mesmo ticket simultaneamente | A: `authorized`, B: `duplicate` ✅ |
| Terminal já registrado (re-validação) | `duplicate` com `first_entry_at` ✅ |

---

## v1.1.0 — 2026-06-27 · Produção (Railway)

### Resumo

Correções críticas de bugs que impediam o funcionamento do sistema em produção (Cloudflare + Railway). Otimizações de performance, validação de dados, e pipeline CI/CD.

---

### 🐛 Bugs Corrigidos

#### CRÍTICO: 304 Not Modified quebrava `ensureEvent()`
- **Sintoma**: Dashboard não carregava, aba Config mostrava "Nenhum evento configurado", Console exibia "npm run seed"
- **Causa raiz**: Cloudflare CDN retornava HTTP 304 em requisições subsequentes ao `/api/events/active`. O axios tratava 304 como erro (fora do range 200-299). O `ensureEvent()` caía no `catch` e nunca populava `eventId`.
- **Correção em 3 camadas**:
  1. `backend/src/app.js` — `app.disable('etag')` + headers `Cache-Control: no-store`, `CDN-Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0` em todas as rotas `/api`
  2. `frontend/src/services/api.js` — `validateStatus` aceita 304 como resposta válida
  3. `frontend/src/store/terminalStore.js` — `ensureEvent()` robusto, não quebra com `response.data` vazio
- **Arquivos**: `api.js:9`, `app.js:24-37`, `terminalStore.js:42-58`

#### CRÍTICO: CORS bloqueava todas as requisições
- **Sintoma**: DevTools mostrava "blocked by CORS policy: Request header field cache-control is not allowed"
- **Causa**: O interceptor do axios injetava `Cache-Control` e `Pragma` como headers de requisição, mas o CORS `allowedHeaders` só aceitava `Content-Type` e `Authorization`
- **Correção**: Removidos os headers do interceptor (o backend já envia como headers de resposta). Adicionados `Cache-Control` e `Pragma` ao `allowedHeaders` do CORS
- **Arquivos**: `api.js:12-19`, `app.js:53`

#### CRÍTICO: Upload de arquivos sempre falhava
- **Sintoma**: Erro vermelho "Não foi possível importar o arquivo" ao tentar fazer upload de XLSX
- **Causa**: `ImportTab.jsx` definia manualmente `Content-Type: multipart/form-data` sem o `boundary`. O servidor (multer) não conseguia parsear a requisição.
- **Correção**: Removido o header manual — axios define automaticamente o `Content-Type` com o `boundary` correto
- **Arquivo**: `frontend/src/components/admin/ImportTab.jsx:82`

#### CRÍTICO: `terminalId` nunca persistia no IndexedDB
- **Sintoma**: Heartbeat nunca registrava terminal no servidor, logs offline perdiam `terminal_id`, dashboard mostrava terminais como offline
- **Causa**: `syncService.js` lia `terminalId` do IndexedDB via `getTerminalId()`, mas `setTerminalId()` nunca era chamada
- **Correção**: `terminalStore.js` agora gera UUID v4 no primeiro acesso, persiste em IndexedDB via `initTerminal()`. `syncService.js` captura o `terminal_id` da resposta do heartbeat
- **Arquivos**: `terminalStore.js:15-25`, `syncService.js:48-61`

#### ALTO: Snapshot sobrescrevia ingressos validados offline
- **Sintoma**: Ingresso validado offline voltava ao status `active` após sync com o servidor
- **Causa**: O merge do snapshot usava `db.tickets.put({ ...ticket })` sem comparar timestamps
- **Correção**: Merge agora preserva `local.id`, compara `updated_at`, e nunca sobrescreve status `validated`
- **Arquivo**: `frontend/src/services/syncService.js:33-60`

---

### ✨ Melhorias

#### Validação UUID v4
- `backend/src/utils/validation.js` — Regex UUID v4 estrita (versão 4, variante DCE)
- `backend/src/modules/import/import.service.js` — Rejeita `ticket_code` inválido durante importação
- `backend/src/modules/validation/validation.service.js` — Retorna `not_found` sem consultar DB para UUIDs inválidos

#### Importação com batch override
- `backend/src/modules/import/import.controller.js` — Aceita parâmetro opcional `batch`
- `backend/src/modules/import/import.service.js` — `normalizeRecord()` aceita `batchOverride`
- `frontend/src/components/admin/ImportTab.jsx` — Campo "Lote padrão" na UI

#### Offline: Fila de re-verificação
- `frontend/src/hooks/useValidation.js` — Tickets não encontrados offline são enfileirados em localStorage e re-verificados ao reconectar (max 50, expiram em 1h)

#### Busca offline otimizada
- `frontend/src/services/localDB.js` — Índice composto `[event_id+display_name]` (Dexie v2)
- `frontend/src/components/SearchPanel.jsx` — `.each()` com parada antecipada substitui `.filter()`, debounce reduzido de 350ms para 250ms

---

### 🔧 Infraestrutura

#### CI/CD (GitHub Actions)
- `.github/workflows/ci.yml` — Backend: PostgreSQL + migrate + seed + test / Frontend: lint + build
- `.github/workflows/deploy.yml` — Deploy automático Railway em push para `main`
- IDs dos serviços Railway configurados: backend `2df5e0ce...`, frontend `b67f3d4b...`

#### Cache-Control (HTTP)
- `backend/src/app.js` — `app.disable('etag')` + headers `Cache-Control`, `CDN-Cache-Control`, `Pragma`, `Expires`
- `frontend/server.js` — HTML/registerSW: `no-cache`, assets com hash: `immutable` (1 ano)

#### Frontend: URL do backend hardcodada
- `frontend/src/services/api.js` — Fallback `https://backend-production-9738e.up.railway.app` se `VITE_API_URL` não definida
- Timeout aumentado de 8s para 15s (upload de arquivos grandes)

---

### 📝 Documentação

- `SPEC-sistema-validacao-portaria.md` — Atualizada para arquitetura UUID v4 (removidas todas as referências a CPF, hash_cpf, salt)
- `CHANGELOG.md` — Este documento
- `plans/001-008` — 8 planos de implementação documentados

---

### 📊 URLs de Produção

| Serviço | URL |
|---------|-----|
| Frontend | https://frontend-production-b15b.up.railway.app |
| Backend API | https://backend-production-9738e.up.railway.app |
| Health Check | https://backend-production-9738e.up.railway.app/api/health |

### 🔑 Credenciais

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Admin | admin@validevento.com | admin123 |
| Supervisor | supervisor@validevento.com | supervisor123 |
| Validador | validador@validevento.com | validador123 |

---

## v1.0.0 — 2026-06-26 · Migração CPF → UUID v4

- Migração de validação por hash CPF para UUID v4 (ticket_code)
- Removidos: `hash_cpf`, `salt`, status `generated`/`linked`
- Status simplificados: `active`, `validated`, `blocked`
- Migração SQL: `backend/migrations/03_uuid_only.sql`
