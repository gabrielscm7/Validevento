# Handoff — Patch de Correções 2.4.x-hotfix (segurança + runtime)

> **Para a próxima sessão:** leia este documento por inteiro antes de agir.
> O patch foi aplicado em 2 commits (sessões 1 e 2) e **deployado** (sessão 3,
> smoke 10/10 aprovado). Não restam pendências de produção em aberto.
>
> **Contexto de segurança:** nada de produção (Railway/variáveis/
> migrations) deve ser alterado sem confirmar com o usuário. Segredos nunca
> vão para o repo (ficam fora do workspace, ex.: Temp/opencode).

---

## Resultado da sessão (09/09/2026)

> Executado o `Docs/PROMPT-patch-correcoes-estruturado.md` em 2 sessões
> independentes, uma por vez. Frontend **não** foi alterado. Nada fora do
> escopo foi implementado. Testes backend **75/75 passed** (13 suítes).
> Migration **007 aplicada apenas no banco dev local** (via `npm run migrate`).
>
> **Sessão 3 (09/09/2026) — deploy concluído e smoke 10/10 aprovado:**
> push `9bc53fc..707ad11` → auto-deploy Railway **SUCCESS** (commit `707ad11`).
> Migration 007 aplicada em produção via `preDeploy` (`npm run migrate`) — logs
> confirmam `007_legacy_events.sql OK`. Variáveis obrigatórias presentes no
> Railway (`JWT_SECRET` forte, `CPF_LOOKUP_SALT`, `DATABASE_URL`, `CORS_ORIGIN`).
> Smoke pós-deploy: `/health` 200 público; `/api/health` 401 sem token e 200
> com master; login master/validator OK; reset de senha com token válido OK
> (senha mantida); evento `draft` → 200 master / 403 validator (mesmo tenant);
> 404 validador fora do tenant (anti-vazamento); relatório CSV/MD de evento
> legado e draft → 200.

### Commits em `master`

| Commit | Escopo | Mensagem |
|---|---|---|
| `b65cb07` | Sessão 1 — segurança no startup | `fix(security): validar variáveis críticas, corrigir expiração de token e proteger /api/health` |
| `707ad11` | Sessão 2 — runtime e acesso | `fix(runtime): busca com limite, timestamps futuros e acesso a eventos draft/legados` |

> Observação: a branch local está **2 commits à frente de `origin/master`**
> (nada foi feito `push`). O próximo passo natural é revisar e `git push origin master`
> (Railway tem auto-deploy).
>
> ~~Observação acima~~ — **resolvida na Sessão 3**: `git push origin master`
> executado (`9bc53fc..707ad11`) e deploy Railway concluído com sucesso.

---

## O que mudou (resumo técnico)

### Sessão 1 — `backend/src/config/env.js`, `modules/auth/auth.service.js`, `app.js`, `.env.example`
- **`env.js`**: validação de startup em produção exige `JWT_SECRET`,
  `CPF_LOOKUP_SALT`, `DATABASE_URL`, `CORS_ORIGIN` (senão `process.exit(1)`);
  aviso em dev quando `JWT_SECRET` ausente. **Fallback inseguro do
  `jwtSecret` removido** (`|| ''`).
- **`auth.service.js`** (`resetPassword`): o `SELECT` agora inclui
  `email_token_exp`. Antes o campo nunca era lido → token válido também era
  rejeitado como expirado.
- **`app.js`**: `/health` continua público (keep-alive cron-job.org);
  `/api/health` agora exige **auth + role master** (payload com memory/uptime/
  env e teste de conexão com o banco).
- **`.env.example`**: comentários de geração (`randomBytes` 64/32) e valores
  em branco para `JWT_SECRET`/`CPF_LOOKUP_SALT`.

### Sessão 2 — `validation.service/controller`, `sync.service`, `eventAccess.js`, `migrations/007`
- **Busca manual** (`validation.service.js searchTickets`): mínimo **3 chars**
  (após `trim()`) e trunca em **100 chars** antes da query. Controller `search`
  devolve **400** para busca curta (antes 500).
- **Sync offline** (`sync.service.js processOfflineLogs`): timestamps
  `created_at` > agora+5min são corrigidos para `now()` com warn (relógio de
  terminal adiantado).
- **`eventAccess.js`**: evento com status `draft`/`closed` passa a ser
  **403 para `validator`/`supervisor`** (`event_status` no body). Admin e
  master passam independentemente do status.
- **Migration `007_legacy_events.sql`** (idempotente): normaliza eventos sem
  status → `closed`, cria `event_config` padrão para eventos sem config,
  associa `tenant_id` (só single-tenant) e índice parcial
  `idx_terminals_online_last_seen`.
- **Relatórios/dashboard**: não havia `JOIN event_config` — as queries já
  tratam ausência de config com default (equivalente a LEFT JOIN + COALESCE) e
  não bloqueiam por status. Validado pelos testes legados (200 com zeros).

### Testes adicionados
- `auth.test.js`: `T-reset-exp`, `T-reset-ok`, `T-health-public`, `T-health-private`
- `validation.test.js`: `T-search-min`, `T-search-limit`
- `sync.test.js`: `T-sync-future`
- `events.test.js`: `T-draft-1`, `T-draft-2`, `T-legacy-1`, `T-legacy-2`

---

## Pendências para a próxima sessão (produção — exigem aval)

### HOTFIX-1 — Revisar e fazer push para `origin/master`
- Branch local está 2 commits à frente (`b65cb07`, `707ad11`).
- **Ação:** `git push origin master` (Railway auto-deploy no branch `master`).
- **Atenção:** revisar preDeploy/start do serviço backend — o novo `env.js`
  **derruba o boot em produção** se faltar alguma das variáveis obrigatórias.

### HOTFIX-2 — Aplicar migration 007 no Supabase de produção
- Rodar `npm run migrate` no ambiente de produção (ou aplicar o conteúdo de
  `backend/migrations/007_legacy_events.sql` no SQL editor do Supabase).
- Idempotente — seguro re-executar.

### HOTFIX-3 — Confirmar variáveis críticas no Railway (Settings → Variables)
- `JWT_SECRET` **deve estar definida e forte** (64 bytes hex). Se hoje há um
  valor fraco em produção, trocar **invalida todos os JWTs ativos** — planejar
  janela de manutenção.
- `CPF_LOOKUP_SALT` **já definida** (P3 do handoff anterior, fora do repo).
  **Nunca alterar** após usuários criados.
- `CORS_ORIGIN` e `DATABASE_URL` definidas.

### HOTFIX-4 — Smoke test manual pós-deploy
- Login com CPF master; reset de senha (token expira corretamente);
  acesso a evento `draft` como admin (200) e como validador (403);
  relatório de evento legado/sem `event_config` (200).
- Conferir `/health` (público) e `/api/health` (master apenas).

---

## Comandos úteis

```bash
cd backend
npm test          # 75 passed (13 suítes)
npm run migrate   # aplica migrations (inclui 007) — em produção exige aval

# Git
git push origin master
```

---

## Decisões registradas (não reverter sem motivo)

1. `/health` é público (keep-alive); qualquer payload interno/diagnóstico
   moveu-se para `/api/health` restrito a **master**.
2. Startup em produção **falha rápido** (`process.exit(1)`) se faltar variável
   crítica — comportamento intencional de segurança.
3. Draft/closed passam a ser inacessíveis a validator/supervisor via
   `eventAccess`; admin/master seguem com acesso total.
4. Eventos legados devem ser normalizados pela migration 007 (não por código
   de correção pontual espalhado).
5. Migrations são idempotentes e reexecutadas em cada boot de teste — qualquer
   migration nova **deve** seguir esse padrão (`IF NOT EXISTS`/`ON CONFLICT`).

---

## Status de execução (atualizar ao tratar)

| # | Pendência | Status | Observação |
|---|---|---|---|
| HOTFIX-1 | Push para origin/master (deploy) | DONE | `9bc53fc..707ad11`; deploy Railway SUCCESS (commit `707ad11`, 09/09/2026) |
| HOTFIX-2 | Migration 007 no banco de produção | DONE | Aplicada via preDeploy `npm run migrate` no deploy — logs confirmam OK |
| HOTFIX-3 | Confirmar JWT_SECRET / CPF_LOOKUP_SALT / CORS_ORIGIN no Railway | DONE | Presença confirmada (backend/production); JWT_SECRET forte; salt não deve ser alterado |
| HOTFIX-4 | Smoke test manual pós-deploy | DONE | 10/10 aprovado: health público/privado, login, reset senha, draft 200/403, relatórios legado e draft |

Status: TODO | IN PROGRESS | DONE | BLOCKED (razão em uma linha)
