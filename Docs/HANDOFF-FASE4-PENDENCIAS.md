# Handoff — Validevento v2 · Pós-Fase 4 (frontend completo)

> **Para a próxima sessão:** leia este documento por inteiro antes de agir.
> Execute as pendências na ordem da seção "Plano de tratamento" e respeite os
> "STOP conditions". Atualize este arquivo (status) e o `plans/README.md` ao
> concluir cada item.
>
> **Contexto de segurança:** toda pendência que mexe no backend (Railway,
> variáveis, migrations, banco de produção) exige aval explícito do usuário
> antes de executar. Nunca rode `npm run seed` em produção sem confirmar.

---

## 1. Estado atual (o que já está pronto)

| Área | Estado |
|---|---|
| Frontend Fase 4 (Partes A→I) | ✅ Concluído e commitado (9 commits em `master`) |
| Testes frontend (Vitest) | ✅ 16/16 passed (`npm test`) |
| Testes backend (Jest) | ✅ 56/56 passed |
| Lint frontend | ✅ 0 problemas (`npm run lint`) |
| Build frontend + PWA | ✅ OK (`npm run build`) |
| Backend (Fases 1–3) | ✅ Testado; **nenhum arquivo backend alterado** na Fase 4 |
| Docs entregues | `Docs/CHECKLIST-DEPLOY-v2.md`, `CHANGELOG.md` (v2.3.0) |

### Git
- Branch local: `master`
- **Enviada para `origin/master`** em 06/09/2026 (`a4da41c..29c1222` + docs posteriores)
- Remote: `https://github.com/gabrielscm7/Validevento.git`
- Últimos commits locais: pendências P1–P9 desta sessão (P5, P6, fix `/recuperar`, Agent.md, docs)

### Infra publicada (verificada via Railway MCP, env `production`)
- Projeto Railway: `validevento` (`6b703342-…`) · workspace `gabrielscm7's Projects`
- Serviços: `backend` (`2df5e0ce-…`), `frontend` (`b67f3d4b-…`), `Postgres` (`30b5536d-…`)
- Env de produção: `3bb73c6a-5754-443a-9155-6ec2a874b68f`
- Domínio backend: `https://backend-production-9738e.up.railway.app`
- Domínio frontend: `https://frontend-production-b15b.up.railway.app`
- **Frontend real está no Railway** (não Vercel como o PRD previa).

---

## 2. Pendências — visão geral

| # | Pendência | Área | Prioridade | Bloqueia? |
|---|---|---|---|---|
| P1 | Deploy do backend FAILED + push da branch | Railway/Git | 🔴 Alta | Produção fora do ar |
| P2 | `RESEND_API_KEY` ausente | Railway vars | 🔴 Alta | E-mails não chegam |
| P3 | `CPF_LOOKUP_SALT` ausente | Railway vars | 🔴 Alta | Login por CPF inseguro/incorreto |
| P4 | Migrations + usuário master no banco | Banco prod | 🔴 Alta | Sem usuário p/ logar |
| P5 | `banner_url`/`logo_url` (migration + service) | Backend | 🟡 Média | Personalização por evento |
| P6 | `POST /api/auth/resend-verification` | Backend | 🟡 Média | Reenvio de convite |
| P7 | Smoke test em produção | QA | 🟡 Média | Confiança p/ entrega |
| P8 | `Agent.md` desatualizado (diz "frontend v1") | Docs | 🟢 Baixa | Contexto de nova sessão |
| P9 | (Opcional) `FRONTEND_URL` e `seed` no preDeploy | Railway/Revisão | 🟢 Baixa | — |

---

## 3. Plano de tratamento (ordem recomendada)

### P1 — Deploy do backend FAILED + push da branch

**Contexto verificado**
- Deploy `a581eb36-…` (backend, prod) está **FAILED** desde 25/08; o build
  passa, a falha ocorre no **runtime** (deploy logs vazios).
- O commit publicado é `a4da41c`; o código real está 31 commits à frente.

**Ações**
1. `git push origin master` (31 commits: Fases 1–4).
2. Diagnóstico do deploy: Railway MCP → `get-logs` no deployment `a581eb36`
   (tipos `deploy`/`build`) para ver por que caiu. Se for "no deploy logs",
   testar start local do backend (`node src/app.js`) com as variáveis.
3. Acionar novo deploy do serviço backend.
4. Confirmar `GET https://backend-production-9738e.up.railway.app/health` → 200.

**STOP conditions**
- Não disparar `accept-deploy` sem o usuário confirmar.
- Se o redeploy falhar por migração/seed, investigar antes de forçar.

---

### P2 e P3 — Variáveis de ambiente no backend (Railway)

**Contexto**: serviço backend tem 6 vars; faltam `RESEND_API_KEY` e
`CPF_LOOKUP_SALT`. Ambas são críticas e **não podem ser inventadas** — o
usuário precisa fornecer a `RESEND_API_KEY` (Resend) e o salt é gerado na hora.

**Ações**
1. Obter `RESEND_API_KEY` com o usuário (Resend).
2. Gerar salt longo/aleatório e **documentar em cofre** (nunca no repo; não pode
   mudar depois — é usado em `cpf_lookup_hash` SHA-256).
3. Definir no serviço backend (Railway): `RESEND_API_KEY`, `CPF_LOOKUP_SALT`
   (e opcionalmente `FRONTEND_URL=https://frontend-production-b15b.up.railway.app`).

**STOP conditions**
- **Nunca** definir `CPF_LOOKUP_SALT` depois de já existirem usuários criados
  com outro salt — o login quebrará. Definir antes do P4.
- Não colocar valores no código nem no CHANGELOG.

---

### P4 — Banco de produção: migrations + usuário master

**Contexto**
- Migrations: `001_initial_v1`, `002_batches`, `003_v2_schema`, `004_phase2`,
  `005_audit_immutable` (+ `backend/src/migrations`).
- `preDeployCommand` roda `npm run migrate && npm run seed` — **revisar o seed
  em produção** (pode não ser desejável recriar dados toda vez).

**Ações**
1. Confirmar migrations aplicadas (conferir tabelas `clients`, `users`,
   `event_config`, `audit_logs`, trigger `prevent_audit_delete`).
2. Confirmar imutabilidade do audit:
   ```sql
   SELECT has_table_privilege('public', 'audit_logs', 'DELETE'); -- esperado: false
   ```
3. Criar usuário master **somente se não existir** (usar o `CPF_LOOKUP_SALT`
   definitivo do P3):
   ```sql
   INSERT INTO users (name, email, cpf_lookup_hash, email_verified, role, active)
   VALUES ('Administrador Master', '<email>',
           encode(digest('<cpf>' || '<CPF_LOOKUP_SALT>', 'sha256'), 'hex'),
           true, 'master', true);
   ```

**STOP conditions**
- Confirmar com o usuário qual e-mail/CPF usar para o master.
- Não rodar `seed` sem entender o que ele insere (evitar duplicar master/admin).

---

### P5 — banner_url / logo_url (personalização por evento)

**Contexto**
- O frontend já lê `banner_url`/`logo_url` do GET do evento e usa fallback da
  identidade padrão quando ausentes (decisão registrada na Parte A).
- Faltam no backend: colunas na tabela `events` e aceitação dos campos no
  `events.service.updateEvent` (whitelist atual: name/date/location/capacity/responsible).

**Ações**
1. Nova migration (ex.: `006_event_branding.sql`):
   ```sql
   ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_url TEXT;
   ALTER TABLE events ADD COLUMN IF NOT EXISTS logo_url TEXT;
   ```
2. Liberar `banner_url`/`logo_url` em `events.service.js` (create + update).
3. Registrar a rota de upload (se desejar upload real; hoje aceita URL externa).
4. Rodar migration e testes do backend; atualizar `Docs/CHECKLIST-DEPLOY-v2.md`
   removendo esta pendência.

**STOP conditions**
- Exige **aval explícito** para alterar backend.

---

### P6 — POST /api/auth/resend-verification

**Contexto**
- O SPEC lista o endpoint, mas o backend não o implementa. A tela
  `ActivateAccount` já chama e trata o erro graciosamente.
- Implementação sugerida: espelhar `forgotPassword`/`verifyEmail` — gerar novo
  `email_token` (TTL 48h), enviar e-mail de ativação e responder mensagem
  genérica (não revelar se o e-mail existe).

**Ações**
1. Adicionar rota no `auth.routes.js` + handler no `auth.controller/service`.
2. Teste automatizado (estilo dos existentes em `backend/src/__tests__`).
3. Rodar suíte backend.

**STOP conditions**
- Exige **aval explícito** para alterar backend.

---

### P7 — Smoke test em produção

Após deploy OK e variáveis definidas, executar (P1–P4 primeiro):
1. Login com CPF do master → `/master`.
2. Criar cliente + cotas.
3. Criar usuário admin → e-mail de ativação chega? (`RESEND_API_KEY`)
4. Criar evento + importar CSV de teste (lote).
5. Abrir `/terminal/:eventId` no celular; instalar PWA; validar QR + busca manual.
6. Conferir dashboard/supervisor (logs, fluxo) e baixar relatório MD/CSV.
7. Lighthouse: confirmar PWA "installable".

---

### P8 — Atualizar Agent.md

O `Agent.md` ainda descreve o frontend como "o da v1" e lista fases futuras já
concluídas. Atualizar:
- "Estado Atual do Projeto" → frontend v2 completo (rotas por perfil, Login CPF,
  painéis Master/Admin/Supervisor, terminal PWA).
- Remover/marcar como concluídas as Fases 2–4 da seção "Próximos Passos".
- Registrar identidade visual `--vv-*` e stack atual (sem Tailwind no novo
  frontend).

---

### P9 — Revisões opcionais
- Definir `FRONTEND_URL` no backend (links de e-mail).
- Revisar `npm run seed` no `preDeployCommand` do Railway (evitar re-seed em
  produção com dados reais).
- Definir `RESEND` remetente autorizado (`backend/src/utils/email.js` usa domínio
  verificado).

---

## 4. Comandos de verificação úteis

```bash
# Frontend
cd frontend
npm test          # 16 passed
npm run lint      # 0 problems
npm run build     # OK + PWA
npm run generate:icons

# Backend
cd backend
npm test          # 56 passed

# Git
git push origin master
```

---

## 5. Decisões registradas (não reverter sem motivo)

1. Frontend novo em **CSS custom + tokens `--vv-*`, sem Tailwind** (decisão do usuário).
2. `react-router-dom` **v7 mantido** (API declarativa v6), sem downgrade.
3. Hooks/stores/services da **Fase 3 mantidos**; páginas/componentes legados
   substituídos.
4. Personalização por evento (`banner_url`/`logo_url`) tem **fallback padrão**
   até o backend suportar (P5).
5. Infra real = **Railway p/ backend e frontend** (o PRD previa Vercel; não migrar
   sem pedido).
6. Usuário master em produção é criado **via SQL**, nunca por seed automático cego.

---

## 6. Status de execução (atualizar ao tratar)

| # | Pendência | Status | Observação |
|---|---|---|---|
| P1 | Deploy backend + push | DONE | Push `a4da41c..29c1222`; deploy backend `5c72fc3b` SUCCESS (runtime antes caía sem logs); frontend `e41cab83` SUCCESS; `/health` e `/api/health` → 200 |
| P2 | RESEND_API_KEY | DONE | Definida no serviço backend (Railway); valor veio do usuário (não registrado) |
| P3 | CPF_LOOKUP_SALT | DONE | Salt 96 hex gerado e guardado fora do repo (ver segredos de prod); definido antes de qualquer usuário v2 |
| P4 | Migrations + master | DONE | Migrations 01→006 aplicadas (audit DELETE=false; `banner_url`/`logo_url` OK); master `gabrielscm@gmail.com` CPF `998.834.062-15` criado via SQL com o salt definitivo; login validado |
| P5 | banner/logo no backend | DONE | Migration `006_event_branding.sql` + liberado em create/update (`events.service`/`events.controller`); teste `T-events-5`; suíte 59/59 |
| P6 | resend-verification | DONE | `POST /api/auth/resend-verification` (token 48h, resposta genérica); testes `T-email-3/4`; suíte 59/59 |
| P7 | Smoke test prod | IN PROGRESS | Login do master OK via API; itens de UI/browser pendem do usuário (ver Checklist §6) |
| P8 | Atualizar Agent.md | DONE | `Agent.md` reescrito (frontend v2, infra Railway 100%, migrações até 006, testes 59/59) |
| P9 | Revisões opcionais | IN PROGRESS | DONE: seed removido do preDeploy (só `migrate`), `FRONTEND_URL` e `CORS_ORIGIN` (→ domínio do frontend, aplica no deploy seguinte) definidas. PENDENTE: confirmar remetente Resend (`EMAIL_FROM`/domínio) — usuário vai configurar domínio de e-mail depois |

Status: TODO | IN PROGRESS | DONE | BLOCKED (razão em uma linha)
