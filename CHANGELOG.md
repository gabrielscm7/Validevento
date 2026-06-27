# Changelog — Validevento

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
