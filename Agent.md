# Validevento — Agent Context & Memory

## 🎯 Visão Geral & Objetivo

SaaS multi-tenant (v2) de validação de acesso a eventos com operação
offline-first, validação por QRCode (UUID v4), PWA para celular e múltiplos
terminais. Hierarquia **Master → Cliente (tenant) → Admin → Supervisor →
Validador**. O login de usuários é feito por **CPF + senha** (nunca CPF em
texto puro) com verificação de e-mail; o validador lê QRCode (câmera), faz
busca manual (nome) ou usa leitor USB (Elgin EL250). Admin acompanha ocupação
em dashboard em tempo real.

## 🛠️ Stack Tecnológica

### Backend
| Componente | Versão |
|---|---|
| Node.js | 20 |
| Express | 4.19 |
| PostgreSQL | 15 (Docker local / Supabase produção) |
| JWT (jsonwebtoken) | 9.0 |
| bcryptjs | 2.4 |
| Resend | 6 |
| multer | 1.4 |
| csv-parse | 5.5 |
| express-rate-limit | 7 |

### Frontend
| Componente | Versão |
|---|---|
| React | 19.2 |
| Vite | 8 |
| React Router DOM | 7.17 |
| Zustand | 5 (persist) |
| Axios | 1.17 |
| Dexie (IndexedDB) | 4.4 |
| html5-qrcode | 2.3 |
| Tailwind CSS | 3.4 |
| shadcn/ui (base-ui) | — |
| lucide-react | 1.20 |
| recharts | 3.8 |
| Vite PWA plugin | 1.3 |
| Workbox | 7.4 |

### Infra
| Serviço | Função |
|---|---|
| Docker (PostgreSQL 15 Alpine) | Banco local dev |
| Railway | Deploy backend |
| Vercel | Deploy frontend |
| Supabase | PostgreSQL gerenciado (produção) |

## 🔄 Modelo de identidade e validação (histórico + v2)

**Linha do tempo:**
- **v1 (legado):** o CPF era usado como chave de validação; depois a validação
  foi migrada para **UUID v4** (`ticket_code`), sem CPF no sistema.
- **v2 (SaaS multi-tenant):** a validação **continua por UUID v4** no QRCode,
  mas o **CPF volta como identificador de LOGIN** (nunca em texto puro).

### Como funciona na v2
- Login por CPF: lookup rápido via `cpf_lookup_hash`
  (`SHA-256(cpf_limpo + CPF_LOOKUP_SALT)`, coluna UNIQUE).
- Senha: `bcrypt` (12 rounds) em `password_hash`.
- `cpf_hash` (bcrypt do CPF) é mantido como coluna de auditoria/redundância —
  não é usado no lookup e nunca é exposto.
- E-mail usado apenas para verificação (ativação 48h) e recuperação de senha
  (token 1h), enviados via Resend.

### Arquivos de utilidades
- `backend/src/utils/hash.js` — recriado na v2 com `cpfLookupHash`,
  `hashPassword` e `comparePassword`.
- `backend/src/utils/email.js` — novo (wrapper Resend; suprime envio sem
  `RESEND_API_KEY`, ex.: dev/testes).

### Migração de banco
- Executar `backend/migrations/003_v2_schema.sql` em databases existentes
  (backfill automático de registros legados para o "Cliente Legado v1").

## 🧠 Estado Atual do Projeto

### Implementado e operacional

**Backend — REST (legado v1 + módulos v2 da Fase 1):**
- Autenticação por **CPF + senha** com verificação de e-mail (roles: master, admin, supervisor, validator)
  - `POST /api/auth/login`, `/verify-email`, `/forgot-password`, `/reset-password`, `GET /api/auth/me`
- **Clientes (master only):** `GET/POST /api/clients`, `GET/PUT /api/clients/:id`, `PATCH .../suspend`, `PATCH .../activate`, `GET /api/clients/:id/usage`
- **Usuários (admin/master):** criação por CPF com e-mail de ativação e controle de cotas por tenant (`POST /api/users`), listagem/edição/desativação
- Importação multi-formato (CSV, JSON, XML, XLSX) com aceitação de MIME genérico de mobile (BUG-03)
- Validação por QRCode (UUID v4) e manual — duplicata retorna `duplicate` com `first_entry_at` (BUG-01)
- Busca de participantes por nome (ILIKE)
- Sync offline: snapshot incremental + envio de logs + heartbeat
- Dashboard completo (sumário, fluxo por hora, lotes, alertas, terminais, live feed, export CSV)
- CRUD de lotes (admin) e cancelamento de ingressos
- Reset de dados do evento
- `GET /health` (keep-alive Railway)
- Migrações versionadas (01_init_schema, 02_batches, 003_v2_schema, 03_uuid_only)
- Seeds (master/admin/supervisor/validator + 10 tickets de teste com UUIDs)
- Middlewares: JWT + tenant ativo (`tenant_suspended`), roles, `audit_logs`
- Testes automatizados **Jest + Supertest** (19 testes: auth, clients, import, validation, quota)

> ⚠️ **Frontend ainda é o da v1** (login email/senha, sem clientes/cotas).
> A atualização para o fluxo v2 (login por CPF, painel Master, ativação de
> e-mail) está prevista para as próximas fases.

**Armazenamento local (IndexedDB com Dexie):**
- Stores: tickets, entry_logs, meta
- Sincronização automática a cada 60 min, ao reconectar, e sob demanda
- Lógica offline-first: valida contra IndexedDB primeiro, fallback para API

## 📜 Regras de Ouro e Premissas (Constraints)

1. **Validação por UUID v4** — QRCode contém o `ticket_code` (UUID v4), que é único no banco
2. **Logs imutáveis** — Entry logs e audit_logs não podem ser deletados ou alterados após criados
3. **Offline-first** — Terminal deve funcionar sem internet; validação usa IndexedDB como fonte primária
4. **Não sobrescrever validated** — CSV import e sync nunca atualizam registros com status `validated`
5. **Duplicatas são logadas, não bloqueadas** — entrada duplicata retorna `duplicate` com `first_entry_at`; decisão humana
6. **Sync forçado só admin/supervisor** — validator não pode disparar sync manual
7. **Interface para não-técnicos** — Design minimalista, feedback visual (verde/amarelo/vermelho), sem jargão técnico
8. **Isolamento por tenant** — Toda query em tabela com `tenant_id` filtra por `req.tenantId`; `clients` é master-only
9. **CPF nunca em texto puro** — nunca expor `cpf_hash`, `cpf_lookup_hash` ou `password_hash` em respostas da API
10. **Login exige e-mail verificado** — usuário sem `email_verified` não autentica (`email_not_verified`)
11. **Suspensão de cliente bloqueia o tenant** — login e requisições retornam `tenant_suspended` (403)
12. **Cotas por tenant** — admin não cria usuário acima da cota configurada pelo master (`422 quota_exceeded`)
13. **Variáveis sensíveis via env** — `RESEND_API_KEY`, `CPF_LOOKUP_SALT`, `JWT_SECRET`, `CORS_ORIGIN` nunca no código

## 🚀 Próximos Passos (Fases 2–4)

1. **Fase 2 — Gestão de evento e ingressos:** CRUD de eventos (multi-tenant),
   `event_config`, designação de equipe (`event_team`), lotes, ingresso master
   e convites avulsos/liberação em lista.
2. **Fase 3 — Operação e checkout:** lógica `reentry_mode`, `validation/checkout`,
   portões (`gates`), terminal offline com config do evento no IndexedDB.
3. **Fase 4 — Relatórios e auditoria:** relatório Markdown, export CSV e
   consulta do `audit_logs`.
4. **Frontend v2:** login por CPF, ativação de e-mail, painel Master
   (clientes/cotas), painel Admin e tela de portaria atualizada.
