# Changelog — Validevento

## v2.0.0 — 2026-06-27 · Concorrência e Resiliência

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
