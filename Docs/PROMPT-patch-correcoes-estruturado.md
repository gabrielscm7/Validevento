# Prompt — Patch de Correções Validevento
## Versão: 2.4.x → 2.4.x-hotfix
## Sessão única — estimativa: 1–2h

---

## INSTRUÇÕES PARA O OPENCODE

Leia `docs/PRD-validevento-v2.md` e `docs/SPEC-validevento-v2.md`
antes de começar.

Este prompt é dividido em **sessões independentes**.
Cada sessão cabe em uma janela de contexto.
Execute uma sessão por vez. Ao terminar cada sessão:
  1. Rode `npm test` — todos os testes devem passar
  2. Faça commit com a mensagem indicada
  3. Confirme conclusão antes de iniciar a próxima

Não antecipe sessões. Não implemente nada fora do escopo descrito.
Não altere o frontend neste patch.

---

## SESSÃO 1 — Segurança crítica no startup

**Escopo:** env.js + auth.service.js + app.js
**Risco se não corrigido:** sistema sobe em produção com JWT forjável
e tokens de reset que nunca expiram.

### CORREÇÃO 1.1 — Variáveis críticas sem validação (env.js)

Arquivo: `backend/src/config/env.js`

Adicionar validação de startup logo após carregar o dotenv,
antes de exportar qualquer configuração:

```js
const nodeEnv = process.env.NODE_ENV || 'development';

if (nodeEnv === 'production') {
  const required = ['JWT_SECRET', 'CPF_LOOKUP_SALT', 'DATABASE_URL', 'CORS_ORIGIN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `FATAL: Variáveis de ambiente obrigatórias ausentes em produção: ${missing.join(', ')}`
    );
    process.exit(1);
  }
}

if (nodeEnv !== 'production' && !process.env.JWT_SECRET) {
  console.warn(
    'AVISO: JWT_SECRET não definida. Execute: cp .env.example .env'
  );
}
```

Remover fallback inseguro do JWT_SECRET:
```js
// ANTES:
jwtSecret: process.env.JWT_SECRET || 'fallback-secret-key-change-me',

// DEPOIS:
jwtSecret: process.env.JWT_SECRET || '',
```

Atualizar `backend/.env.example` com comentários explícitos:
```
# OBRIGATÓRIO em produção
# Gerar com: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=

# OBRIGATÓRIO em produção — nunca alterar após primeiro uso
# Gerar com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CPF_LOOKUP_SALT=

# URL do frontend em produção (nunca usar * em produção)
CORS_ORIGIN=https://seu-frontend.vercel.app
```

### CORREÇÃO 1.2 — resetPassword não seleciona email_token_exp (auth.service.js)

Arquivo: `backend/src/modules/auth/auth.service.js`

Localizar a função `resetPassword` (ou equivalente).
Corrigir o SELECT para incluir `email_token_exp`:

```js
// ANTES:
`SELECT id, email_verified FROM users WHERE email_token = $1`

// DEPOIS:
`SELECT id, email_verified, email_token_exp FROM users WHERE email_token = $1`
```

Verificar que a lógica de expiração usa o campo corretamente:
```js
if (!user || !user.email_token_exp || new Date(user.email_token_exp) < new Date()) {
  throw new Error('invalid_or_expired_token');
}
```

### CORREÇÃO 1.3 — /api/health expõe dados internos (app.js)

Arquivo: `backend/src/app.js`

Separar rota pública de rota de diagnóstico:

```js
// Rota pública — apenas para keep-alive (cron-job.org)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rota de diagnóstico — master only
// (mover o payload completo atual para cá)
app.get('/api/health',
  authMiddleware,
  requireRole('master'),
  async (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV,
    });
  }
);
```

### Testes da Sessão 1

Adicionar em `backend/src/__tests__/auth.test.js`:

```
T-reset-exp: Token de reset expirado não redefine senha
  → criar usuário verificado com email_token_exp = now() - 2h
  → POST /api/auth/reset-password com o token
  → deve retornar 400 com error: 'invalid_or_expired_token'
  → senha NÃO deve ter sido alterada no banco

T-health-public: GET /health retorna apenas status e timestamp
  → sem autenticação
  → deve retornar 200 com { status, timestamp }
  → NÃO deve conter 'memory' nem 'uptime'

T-health-private: GET /api/health exige autenticação master
  → sem token → 401
  → com token de validador → 403
  → com token master → 200 com memory e uptime
```

**Commit:** `fix(security): validar variáveis críticas, corrigir expiração de token e proteger /api/health`

---

## SESSÃO 2 — Correções de runtime e acesso

**Escopo:** validation.service.js + sync.service.js +
eventAccess.js + reports + dashboard + migration de dados legados
**Risco se não corrigido:** busca sem limite trava o servidor;
eventos draft e legados inacessíveis para o admin.

### CORREÇÃO 2.1 — Busca manual sem limite de tamanho (validation.service.js)

Arquivo: `backend/src/modules/validation/validation.service.js`

Localizar a função de busca (searchTickets ou equivalente).
Adicionar sanitização antes de qualquer query:

```js
async function searchTickets(eventId, queryText, tenantId) {
  if (!queryText || queryText.trim().length < 3) {
    throw new Error('A busca requer no mínimo 3 caracteres.');
  }
  const normalized = queryText.trim().slice(0, 100);
  // ... restante da função usa `normalized` em vez de `queryText`
}
```

### CORREÇÃO 2.2 — Logs offline com timestamp futuro (sync.service.js)

Arquivo: `backend/src/modules/sync/sync.service.js`

Localizar a função que processa logs offline (processOfflineLogs
ou equivalente). Adicionar validação de timestamp antes de
processar cada log:

```js
const FIVE_MINUTES = 5 * 60 * 1000;
const fiveMinutesFromNow = new Date(Date.now() + FIVE_MINUTES);
let createdAt = isValidDate(log.created_at)
  ? new Date(log.created_at)
  : new Date();

if (createdAt > fiveMinutesFromNow) {
  console.warn(
    `[sync] Log ${log.local_id}: timestamp futuro corrigido de ` +
    `${log.created_at} para now()`
  );
  createdAt = new Date();
}
// usar `createdAt` (não log.created_at) no INSERT
```

Garantir que `isValidDate` existe no arquivo ou criar localmente:
```js
function isValidDate(value) {
  return value && !isNaN(new Date(value).getTime());
}
```

### CORREÇÃO 2.3 — Eventos draft e legados inacessíveis

**2.3a — Migration de dados legados**

Criar `backend/migrations/007_legacy_events.sql`:

```sql
-- Normaliza eventos legados sem status
UPDATE events
SET status = 'closed'
WHERE status IS NULL OR status = '';

-- Cria event_config padrão para eventos sem configuração
INSERT INTO event_config (event_id)
SELECT e.id FROM events e
LEFT JOIN event_config ec ON ec.event_id = e.id
WHERE ec.event_id IS NULL
ON CONFLICT (event_id) DO NOTHING;

-- Associa tenant_id a eventos legados sem tenant
-- (seguro apenas em ambiente single-tenant — 1 cliente ativo)
UPDATE events e
SET tenant_id = (
  SELECT id FROM clients WHERE active = true ORDER BY created_at LIMIT 1
)
WHERE e.tenant_id IS NULL
  AND (SELECT COUNT(*) FROM clients WHERE active = true) = 1;

-- Índice de performance para markOfflineTerminals
CREATE INDEX IF NOT EXISTS idx_terminals_online_last_seen
  ON terminals(online, last_seen_at)
  WHERE online = true;
```

Executar: `npm run migrate` após criar o arquivo.

**2.3b — eventAccess.js — liberar admin/master em draft**

Arquivo: `backend/src/middleware/eventAccess.js`

Aplicar restrição de status apenas para validator e supervisor:

```js
const RESTRICTED_ROLES = ['validator', 'supervisor'];

// Após verificar que o usuário tem acesso ao tenant:
if (RESTRICTED_ROLES.includes(req.user.role) && event.status !== 'active') {
  return res.status(403).json({
    error: 'Este evento não está ativo.',
    event_status: event.status,
  });
}
// Admin e master passam independente do status
```

**2.3c — reports.service.js — LEFT JOIN em event_config**

Arquivo: `backend/src/modules/reports/reports.service.js`

Localizar todos os JOINs com `event_config` e converter para
LEFT JOIN com COALESCE nos campos usados:

```sql
-- ANTES:
JOIN event_config ec ON ec.event_id = e.id

-- DEPOIS:
LEFT JOIN event_config ec ON ec.event_id = e.id

-- Nos campos selecionados, usar COALESCE:
COALESCE(ec.reentry_mode, 'none') AS reentry_mode,
COALESCE(ec.checkout_enabled, false) AS checkout_enabled,
COALESCE(ec.qrcode_field, 'ticket_code') AS qrcode_field
```

Remover qualquer verificação de status que bloqueie a geração
de relatório. O relatório deve funcionar para qualquer status
quando solicitado por admin ou master.

Se não houver entry_logs: retornar relatório válido com zeros
em vez de erro ou array vazio.

**2.3d — dashboard.service.js — mesmo padrão de LEFT JOIN**

Aplicar o mesmo padrão de LEFT JOIN + COALESCE em todas as
queries do dashboard que referenciem event_config.

### Testes da Sessão 2

Adicionar em `backend/src/__tests__/`:

**validation.test.js:**
```
T-search-limit: Busca com string > 100 chars não quebra
  → enviar string de 200 chars em ?q=
  → deve processar os primeiros 100 chars sem erro de DB

T-search-min: Busca com < 3 chars retorna erro
  → ?q=ab
  → deve retornar 400
```

**sync.test.js:**
```
T-sync-future: Log com timestamp 2h no futuro é corrigido
  → POST /api/sync/logs com created_at = now() + 2h
  → deve ser aceito (processed: 1)
  → entry_log gravado deve ter created_at próximo de now()
    (diferença < 10 segundos)
```

**events.test.js:**
```
T-draft-1: Admin acessa evento draft
  → criar evento com status='draft'
  → GET /api/events/:id com token admin
  → deve retornar 200

T-draft-2: Validador não acessa evento draft
  → GET /api/events/:id com token validador
  → deve retornar 403 com event_status: 'draft'

T-legacy-1: Relatório de evento sem event_config retorna 200
  → criar evento sem event_config associado
  → GET /api/events/:id/reports/md com token admin
  → deve retornar 200 com relatório válido

T-legacy-2: Dashboard de evento legado retorna 200
  → GET /api/events/:id/dashboard/summary com token admin
  → deve retornar 200 com contagens (zeros onde sem dados)
```

**Commit:** `fix(runtime): busca com limite, timestamps futuros e acesso a eventos draft/legados`

---

## CHECKLIST FINAL DO PATCH

Após as duas sessões:

- [ ] `npm test` — 100% passando (backend)
- [ ] Migration 007 aplicada no Supabase de produção
- [ ] Variáveis `JWT_SECRET` e `CPF_LOOKUP_SALT` confirmadas
      no Railway (Settings → Variables)
- [ ] Testar manualmente: login com CPF, reset de senha,
      acesso a evento draft como admin, relatório de evento legado
- [ ] Deploy via push para branch master (Railway auto-deploy)

---

## NOTAS IMPORTANTES

- Não alterar nenhum arquivo de frontend neste patch
- Não adicionar novas funcionalidades
- Se encontrar algo além do escopo que pareça urgente,
  registrar em `Docs/BACKLOG-TECNICO.md` e continuar
- Janela de contexto: cada sessão é independente —
  pode ser executada em conversa separada com o OpenCode
