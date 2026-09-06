# Checklist Final de Deploy — Validevento v2.0 (Parte I)

**Data de execução:** 06/09/2026
**Fase:** 4 de 4 (frontend completo) — concluída.
**Status:** ✅ Frontend pronto (16 testes, build e lint OK) · ✅ **Produção no ar** (backend e frontend deployados em `29c1222`; `/health` 200) · 🟡 Smoke test de UI pendente (passos manuais §6).

---

## Resultados de qualidade (executados e aprovados)

| Verificação | Comando | Resultado |
|---|---|---|
| Testes frontend (5 arquivos) | `npm test` (frontend) | ✅ 16/16 passed |
| Testes backend (Fases 1–3) | `npm test` (backend) | ✅ 56/56 passed |
| Build frontend | `npm run build` | ✅ OK + PWA gerado |
| Lint frontend | `npm run lint` | ✅ 0 problemas |
| Nenhum arquivo de backend alterado | `git status` | ✅ 0 alterações em `backend/` |

---

## 1. Backend (Railway)

**Estado real verificado via Railway MCP (projeto `validevento`, env `production`):**

- Repositório: `gabrielscm7/Validevento`, branch `master`, root `backend`, RAILPACK, `preDeployCommand: npm run migrate` (seed removido em 06/09), start `node src/app.js`. ✅ config correta.
- **✅ Deploy do backend SUCCESS** (deployment `5c72fc3b`, 06/09, commit `29c1222`). Migrations `01→006` aplicadas no banco de produção; `/health` e `/api/health` → 200.
- **✅ Branch enviada** para `origin/master` (`a4da41c..29c1222`) — o deploy publicado agora contém as Fases 1–3, o frontend v2 e as pendências P5/P6.
- Variáveis definidas no serviço backend: `CORS_ORIGIN`, `CPF_LOOKUP_SALT`, `DATABASE_URL`, `FRONTEND_URL`, `JWT_EXPIRES_IN`, `JWT_SECRET`, `NODE_ENV`, `PORT`, `RESEND_API_KEY` (9).
  - ✅ `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CPF_LOOKUP_SALT`, `RESEND_API_KEY`, `FRONTEND_URL` presentes.
  - ✅ **`CORS_ORIGIN`** redefinida para `https://frontend-production-b15b.up.railway.app` em 06/09 (corrige BUG-02; vale no deploy seguinte).
  - ⏳ Remetente autorizado no Resend (`EMAIL_FROM` padrão `noreply@validevento.com`) — **a definir**: o usuário vai configurar o domínio de e-mail depois (06/09).

> **Ações manuais realizadas em 06/09:** definidas `RESEND_API_KEY` e `CPF_LOOKUP_SALT` (gerado e guardado fora do repo) e `FRONTEND_URL` no serviço backend; `preDeployCommand` ajustado para rodar apenas `npm run migrate`; usuário master criado via SQL (ver §4); push + deploy.

---

## 2. Frontend (deploy)

- No Railway: serviço backend + frontend publicados em **`29c1222`** (06/09). Frontend no **Railway** (root `frontend`, RAILPACK, `buildCommand: npm run build`, `startCommand: npm start`).
  - ✅ `VITE_API_URL` definida no serviço frontend aponta para o backend Railway.
  - ✅ Novo build publicado e respondendo HTTP 200.
- Build local: ✅ sem erros. PWA: manifest + service worker gerados pelo `vite-plugin-pwa`; ícones `icon-192.png`/`icon-512.png` gerados via `npm run generate:icons`.
- Teste PWA: instale a app pelo navegador (Android/desktop) e confira "instalável" no Lighthouse (pendente §6).

---

## 3. Keep-alive

- ✅ `GET /health` existe no backend (`backend/src/app.js`).
- ✅ Health retorna **200** no deploy atual (`/health` e `/api/health` com `database: connected`).
- Cadastro sugerido no cron-job.org:
  - URL: `https://backend-production-9738e.up.railway.app/health`
  - Método: GET · Intervalo: 5 minutos
  - Ativo 12h antes do evento até 2h após o encerramento.

---

## 4. Banco de dados

- Migrations aplicadas em produção em 06/09/2026 (deploy `29c1222`): `001_initial_v1`, `002_batches`, `003_v2_schema`, `004_phase2`, `005_audit_immutable`, `006_event_branding` + `backend/src/migrations`.
- O `preDeployCommand` agora roda **apenas `npm run migrate`** (seed removido em 06/09 — usuários em produção são criados via SQL, nunca por seed automático).
- **REVOKE DELETE ON audit_logs** — confirmado no banco de produção:
  ```sql
  SELECT has_table_privilege('public', 'audit_logs', 'DELETE');  -- false ✅
  ```
- Usuário master criado via SQL em 06/09 (com o `CPF_LOOKUP_SALT` definitivo):
  - e-mail `gabrielscm@gmail.com` · CPF `998.834.062-15` · role `master` · `email_verified = true`
  - login validado contra `/api/auth/login` → 200.

---

## 5. Pendências conhecidas / decisões desta fase

1. **banner_url / logo_url** — ✅ **implementado** (06/09): migration `006_event_branding.sql` + liberado em `events.service.js` create/update. O frontend lê os campos no GET do evento e usa fallback da identidade padrão quando ausentes. Upload real de arquivo ainda não existe — hoje aceita URL externa (decisão da Parte A mantida).
2. **Resend de ativação** — ✅ **implementado** (06/09): `POST /api/auth/resend-verification` (token novo 48h, resposta genérica). A tela `ActivateAccount` já consome o endpoint.
3. **Dashboard do Master** usa dados reais dos endpoints existentes (`/api/clients`, `/api/clients/:id/usage`, `/api/events`, `/api/users`). Sem endpoint de auditoria global por cliente, a aba "Auditoria" do `ClientDetail` agrega `reports/audit` dos eventos do tenant.
4. **Link de recuperação** — ✅ corrigido (06/09): e-mail aponta para `/recuperar-senha` (rota real do frontend), não mais `/recuperar`.

---

## 6. Smoke test em produção (passos manuais)

Após `git push origin master` + deploy OK (ambos feitos em 06/09):

1. Login com CPF do master → deve ir para `/master`. ✅ **feito via API** (200, role master); falta confirmar no navegador a rota `/master`.
2. Criar cliente + definir cotas. ⬜ navegador
3. Criar usuário admin do cliente → e-mail de ativação (requer `RESEND_API_KEY` — definida). ⬜ navegador + conferir caixa de e-mail
4. Criar evento + importar CSV de teste (lote). ⬜ navegador
5. Abrir `/terminal/:eventId` no celular, instalar PWA e validar um ingresso (QR + busca manual). ⬜ navegador
6. Conferir o log no dashboard/supervisor e gerar/baixar relatório Markdown e CSV. ⬜ navegador

---

## Decisões de arquitetura tomadas no início da Fase 4

- Substituir páginas/componentes legados; **manter hooks/stores/services da Fase 3**.
- Manter `react-router-dom` v7 (API declarativa v6) em vez de downgrade.
- **CSS custom + tokens `--vv-*`, sem Tailwind** no novo frontend.
- banner/logo por evento: sinalizar como pendência + fallback do sistema (item 5.1).
