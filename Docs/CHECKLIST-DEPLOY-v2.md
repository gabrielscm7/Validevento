# Checklist Final de Deploy — Validevento v2.0 (Parte I)

**Data de execução:** 06/09/2026
**Fase:** 4 de 4 (frontend completo) — concluída.
**Status:** ✅ Frontend pronto (16 testes, build e lint OK) · 🟡 Deploy de produção requer ações manuais listadas abaixo.

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

- Repositório: `gabrielscm7/Validevento`, branch `master`, root `backend`, RAILPACK, `preDeployCommand: npm run migrate && npm run seed`, start `node src/app.js`. ✅ config correta.
- **⚠️ Deploy atual do backend está FAILED** (deployment `a581eb36`, 25/08, commit `a4da41c`). Build passa; falha ocorre no runtime (sem logs de deploy). **Pendência pré-existente, alheia à Fase 4.**
- **⚠️ Branch local está 22 commits à frente de `origin/master`** e ainda não foi enviada (`git push`). O deploy publicado não contém as fases 1–3 nem este frontend.
- Variáveis definidas no serviço backend: `CORS_ORIGIN`, `DATABASE_URL`, `JWT_EXPIRES_IN`, `JWT_SECRET`, `NODE_ENV`, `PORT` (6).
  - ✅ `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `PORT` presentes.
  - ❌ **`RESEND_API_KEY` não está definida** → e-mails de ativação/recuperação falham silenciosamente em produção.
  - ❌ **`CPF_LOOKUP_SALT` não está definida** → `cpfLookupHash` usará salt vazio; **obrigatório definir** para login por CPF (e nunca mudar depois).
  - ⚠️ `FRONTEND_URL` não está definida (não é usada hoje pelo backend; o email usa link de ativação — conferir `backend/src/utils/email.js`). Recomenda-se definir.

> **Ação manual necessária:** definir `RESEND_API_KEY` e `CPF_LOOKUP_SALT` no serviço backend (Railway → Variables) e, após `git push origin master`, acionar novo deploy. Ex.: `CPF_LOOKUP_SALT=uma-string-aleatoria-longa-nunca-mudar`.

---

## 2. Frontend (deploy)

- Na infraestrutura real o frontend está publicado no **Railway** (serviço `frontend`, root `frontend`, RAILPACK, `buildCommand: npm run build`, `startCommand: npm start`) — **não** no Vercel como previa o PRD. Documentamos o estado real.
  - ✅ `VITE_API_URL` definida no serviço frontend aponta para o backend Railway.
  - ⚠️ O build publicado é de `a4da41c` (25/08); **requer novo deploy** após o push desta fase.
- Build local: ✅ sem erros. PWA: manifest + service worker gerados pelo `vite-plugin-pwa`; ícones `icon-192.png`/`icon-512.png` gerados via `npm run generate:icons`.
- Teste PWA: instale a app pelo navegador (Android/desktop) e confira "instalável" no Lighthouse quando o novo build estiver no ar.

---

## 3. Keep-alive

- ✅ `GET /health` existe no backend (`backend/src/app.js`).
- 🟡 Health atual retorna **404** porque o deploy de produção está FAILED/antigo. Após deploy válido, confirmar 200 em:
  ```
  https://backend-production-9738e.up.railway.app/health
  ```
- Cadastro sugerido no cron-job.org:
  - URL: `https://backend-production-9738e.up.railway.app/health`
  - Método: GET · Intervalo: 5 minutos
  - Ativo 12h antes do evento até 2h após o encerramento.

---

## 4. Banco de dados

- Migrations existentes (confirmadas no repo): `001_initial_v1` (legado), `002_batches`, `003_v2_schema`, `004_phase2`, `005_audit_immutable` + `backend/src/migrations`.
- O `preDeployCommand` roda `npm run migrate && npm run seed`. ⚠️ **Atenção:** em produção não execute `seed` cegamente se houver dados reais — confirme o comportamento do script antes.
- **REVOKE DELETE ON audit_logs** — migration `005_audit_immutable.sql` aplica. Confirmar no banco:
  ```sql
  SELECT has_table_privilege('public', 'audit_logs', 'DELETE');  -- esperado false
  ```
- Criar usuário master inicial via SQL (somente se ainda não existir):
  ```sql
  INSERT INTO users (name, email, cpf_lookup_hash, email_verified, role, active)
  VALUES ('Administrador Master', 'seu@email.com',
          encode(digest('seu-cpf' || '<CPF_LOOKUP_SALT>', 'sha256'), 'hex'),
          true, 'master', true);
  ```
  > Use exatamente o mesmo `CPF_LOOKUP_SALT` definido nas variáveis do backend.

---

## 5. Pendências conhecidas / decisões desta fase

1. **banner_url / logo_url**: o backend v2 **não possui** essas colunas em `events` nem endpoint de upload. Conforme combinado no início da Fase 4, o frontend lê `banner_url`/`logo_url` quando existirem no GET do evento e usa **fallback da identidade padrão**. Para ativar a personalização por evento, será necessária uma migration (`ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_url TEXT, logo_url TEXT;`) + liberar esses campos no `events.service.updateEvent` — **fora do escopo "frontend-only"** desta fase.
2. **Resend de ativação**: o SPEC lista `POST /api/auth/resend-verification`, mas o backend não o implementa. A tela `ActivateAccount` já trata o erro graciosamente (mensagem + orientação). Implementar no backend se desejado.
3. **Dashboard do Master** usa dados reais dos endpoints existentes (`/api/clients`, `/api/clients/:id/usage`, `/api/events`, `/api/users`). Sem endpoint de auditoria global por cliente, a aba "Auditoria" do `ClientDetail` agrega `reports/audit` dos eventos do tenant.

---

## 6. Smoke test em produção (passos manuais)

Após `git push origin master` + deploy OK:

1. Login com CPF do master → deve ir para `/master`.
2. Criar cliente + definir cotas.
3. Criar usuário admin do cliente → e-mail de ativação (requer `RESEND_API_KEY`).
4. Criar evento + importar CSV de teste (lote).
5. Abrir `/terminal/:eventId` no celular, instalar PWA e validar um ingresso (QR + busca manual).
6. Conferir o log no dashboard/supervisor e gerar/baixar relatório Markdown e CSV.

---

## Decisões de arquitetura tomadas no início da Fase 4

- Substituir páginas/componentes legados; **manter hooks/stores/services da Fase 3**.
- Manter `react-router-dom` v7 (API declarativa v6) em vez de downgrade.
- **CSS custom + tokens `--vv-*`, sem Tailwind** no novo frontend.
- banner/logo por evento: sinalizar como pendência + fallback do sistema (item 5.1).
