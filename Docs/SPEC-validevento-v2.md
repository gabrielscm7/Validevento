# Spec Técnica — Validevento v2.0
## Technical Specification v2.0

**Data:** Setembro 2026
**Referência:** PRD-validevento-v2.md
**Infraestrutura:** Railway Hobby + Vercel Free + Supabase Free + Resend Free

---

## 0. Bugs e Problemas Corrigidos da v1

Os itens abaixo foram identificados durante a operação da v1 e devem ser
corrigidos como parte obrigatória da implementação da v2.

| # | Problema | Local | Correção |
|---|---|---|---|
| BUG-01 | Duplicata retorna `status: 'authorized'` em vez de `'duplicate'` | `validation.service.js` | Retornar `status: 'duplicate'` com `first_entry_at` quando `is_duplicate: true` |
| BUG-02 | `CORS_ORIGIN=*` no ambiente de produção | `backend/.env.example` | Definir URL exata do frontend em produção |
| BUG-03 | Validação de arquivo rejeita MIME types genéricos de mobile | `import.controller.js` | Checar extensão do arquivo além do MIME type |
| BUG-04 | Importação falha com colunas em maiúsculas (`Codigo`, `Nome`) | `import.service.js` | Já corrigido via `FIELD_ALIASES` — garantir cobertura case-insensitive completa |
| BUG-05 | Docker Compose não inclui backend nem frontend | `docker-compose.yml` | Adicionar serviços backend e frontend para dev local completo |

---

## 1. Stack Tecnológica

### 1.1 O que se mantém da v1

| Tecnologia | Versão | Papel |
|---|---|---|
| Node.js | 20 | Runtime do backend |
| Express | 4 | Framework HTTP |
| PostgreSQL | 15 | Banco de dados (Supabase) |
| React | 19 | Frontend |
| Vite | 8 | Build do frontend |
| Tailwind CSS | 3 | Estilização |
| Dexie.js | 4 | IndexedDB offline |
| Zustand | 5 | State management |
| html5-qrcode | 2 | Leitura de QRCode |
| JWT | — | Autenticação stateless |
| bcryptjs | 2 | Hash de senhas e CPF |
| Shadcn/ui | — | Componentes de UI |

### 1.2 O que se adiciona na v2

| Tecnologia | Papel | Justificativa |
|---|---|---|
| **Resend** | E-mail transacional | Gratuito até 3k/mês, API simples |
| **Zod** | Validação de schemas | Substitui validações manuais espalhadas |
| **date-fns** | Manipulação de datas | Leve, sem dependências |
| **express-rate-limit** | Rate limiting (já existe) | Manter e expandir |

### 1.3 O que não será adicionado (e por quê)

| Tecnologia | Motivo da exclusão |
|---|---|
| Redis | Desnecessário — JWT stateless, rate limiting em memória é suficiente no volume atual |
| Bull/BullMQ | Relatórios síncronos são suficientes para 3.000 registros |
| PDFKit | Substituído por Markdown exportável |
| Puppeteer | Muito pesado para Railway Hobby (512MB RAM) |

---

## 2. Modelagem de Dados

### 2.1 Diagrama completo

```
clients ──────────────────────────────────────────┐
  id, name, cnpj, email, plan,                     │
  max_admins, max_supervisors, max_validators,      │
  max_tickets_per_event, active                     │
                                                    │ tenant_id
users ────────────────────────────────────────────┐ │
  id, tenant_id→clients, cpf_hash, name, email,   │ │
  email_verified, email_token, password_hash,      │ │
  role, active                                     │ │
                 │                                  │ │
                 │ created_by                       │ │
                 ▼                                  │ │
events ──────────────────────────────────────────┐ │ │
  id, tenant_id→clients, name, date,             │ │ │
  location, expected_start, capacity,            │ │ │
  responsible[], status                          │ │ │
                 │                               │ │ │
         ┌───────┼──────────┐                   │ │ │
         ▼       ▼          ▼                   │ │ │
  event_config  gates   event_team              │ │ │
  event_id      event_id  event_id, user_id     │ │ │
  (ver 2.3)     name       role_override        │ │ │
                opened_at                       │ │ │
                closed_at                       │ │ │
                         │                      │ │ │
                         ▼                      │ │ │
                      tickets ──────────────────┘ │ │
                        id, event_id, tenant_id    │ │
                        ticket_code (UUID v4)      │ │
                        batch, display_name        │ │
                        status, origin             │ │
                        validated_at, checkout_at  │ │
                                │                  │ │
                                ▼                  │ │
                           entry_logs ─────────────┘ │
                             id, ticket_id            │
                             event_id, tenant_id      │
                             entry_type               │
                             checkout_at              │
                             terminal_id, validator_id│
                             is_duplicate, synced     │
                                                      │
                           audit_logs ────────────────┘
                             id, tenant_id
                             event_id, user_id
                             action, entity_type
                             entity_id, details(JSON)
                             ip_address, created_at

                           master_tickets
                             id, event_id
                             created_by→users
                             max_uses (null=ilimitado)
                             uses_count, active
```

### 2.2 Tabelas — DDL completo

```sql
-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CLIENTES (tenants)
CREATE TABLE clients (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(255) NOT NULL,
  cnpj                  VARCHAR(18),
  email                 VARCHAR(255) NOT NULL UNIQUE,
  plan                  VARCHAR(20) NOT NULL DEFAULT 'basic',
  max_admins            INTEGER NOT NULL DEFAULT 2,
  max_supervisors       INTEGER NOT NULL DEFAULT 5,
  max_validators        INTEGER NOT NULL DEFAULT 10,
  max_tickets_per_event INTEGER NOT NULL DEFAULT 3000,
  max_events_active     INTEGER NOT NULL DEFAULT 1,
  active                BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- USUÁRIOS
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  -- NULL = usuário Master (proprietário do sistema)
  cpf_hash        VARCHAR(255) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  email_verified  BOOLEAN DEFAULT false,
  email_token     VARCHAR(255),
  email_token_exp TIMESTAMPTZ,
  password_hash   VARCHAR(255),
  role            VARCHAR(20) NOT NULL DEFAULT 'validator',
  -- master | admin | supervisor | validator
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_role CHECK (role IN ('master','admin','supervisor','validator'))
);

CREATE INDEX idx_users_tenant   ON users(tenant_id);
CREATE INDEX idx_users_cpf_hash ON users(cpf_hash);

-- EVENTOS
CREATE TABLE events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  date           TIMESTAMPTZ NOT NULL,
  expected_start TIMESTAMPTZ,
  location       VARCHAR(255),
  capacity       INTEGER NOT NULL DEFAULT 3000,
  responsible    TEXT[],
  status         VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- draft | active | closed
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_event_status CHECK (status IN ('draft','active','closed'))
);

CREATE INDEX idx_events_tenant ON events(tenant_id);

-- CONFIGURAÇÃO DO EVENTO
CREATE TABLE event_config (
  event_id              UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  -- Validação
  qrcode_field          VARCHAR(50) NOT NULL DEFAULT 'ticket_code',
  -- ticket_code | cpf | custom_hash
  manual_fields         TEXT[] NOT NULL DEFAULT ARRAY['display_name'],
  -- Reentrada e checkout
  checkout_enabled      BOOLEAN DEFAULT false,
  reentry_mode          VARCHAR(20) NOT NULL DEFAULT 'none',
  -- none | free | conditioned
  duplicate_action      VARCHAR(10) NOT NULL DEFAULT 'warn',
  -- warn | block
  -- Ingresso master
  master_ticket_enabled BOOLEAN DEFAULT false,
  -- Métricas
  validation_speed_target_sec INTEGER DEFAULT 5,
  gate_tracking_enabled BOOLEAN DEFAULT true,
  -- Relatório
  export_formats        TEXT[] DEFAULT ARRAY['md','csv'],
  updated_at            TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_qrcode_field CHECK (
    qrcode_field IN ('ticket_code','cpf','custom_hash')
  ),
  CONSTRAINT valid_reentry_mode CHECK (
    reentry_mode IN ('none','free','conditioned')
  )
);

-- EQUIPE DO EVENTO
CREATE TABLE event_team (
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_override VARCHAR(20),
  PRIMARY KEY (event_id, user_id)
);

-- PORTÕES
CREATE TABLE gates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL DEFAULT 'Portão Principal',
  opened_at   TIMESTAMPTZ,
  opened_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at   TIMESTAMPTZ,
  closed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- INGRESSOS MASTER
CREATE TABLE master_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  max_uses    INTEGER,
  -- NULL = ilimitado
  uses_count  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- INGRESSOS
CREATE TABLE tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ticket_code   VARCHAR(36) NOT NULL,
  batch         VARCHAR(50) NOT NULL DEFAULT 'LOTE-01',
  display_name  VARCHAR(100),
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  -- active | validated | blocked
  origin        VARCHAR(30) NOT NULL DEFAULT 'import',
  -- import | cortesia | liberacao_especial | master
  imported_at   TIMESTAMPTZ DEFAULT now(),
  validated_at  TIMESTAMPTZ,
  checkout_at   TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, ticket_code),
  CONSTRAINT valid_ticket_status CHECK (
    status IN ('active','validated','blocked')
  ),
  CONSTRAINT valid_ticket_origin CHECK (
    origin IN ('import','cortesia','liberacao_especial','master')
  )
);

CREATE INDEX idx_tickets_event       ON tickets(event_id);
CREATE INDEX idx_tickets_tenant      ON tickets(tenant_id);
CREATE INDEX idx_tickets_status      ON tickets(status);
CREATE INDEX idx_tickets_code_lower  ON tickets(LOWER(ticket_code));

-- TERMINAIS
CREATE TABLE terminals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL DEFAULT 'Terminal Móvel',
  last_seen_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  online       BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- LOGS DE ENTRADA
CREATE TABLE entry_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  entry_type    VARCHAR(20) NOT NULL,
  -- qrcode | manual | master
  beneficiary   VARCHAR(255),
  -- nome digitado quando tipo = master
  terminal_id   UUID REFERENCES terminals(id) ON DELETE SET NULL,
  validator_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  is_duplicate  BOOLEAN DEFAULT false,
  checkout_at   TIMESTAMPTZ,
  synced        BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_entry_type CHECK (
    entry_type IN ('qrcode','manual','master')
  )
);

CREATE INDEX idx_logs_event    ON entry_logs(event_id);
CREATE INDEX idx_logs_tenant   ON entry_logs(tenant_id);
CREATE INDEX idx_logs_synced   ON entry_logs(synced);

-- LOG DE AUDITORIA (imutável)
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  event_id    UUID REFERENCES events(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   UUID,
  details     JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_event  ON audit_logs(event_id);
```

---

## 3. Estrutura de Projeto

```
Validevento/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   └── env.js
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT verify + tenant context
│   │   │   ├── roles.js         # controle por perfil
│   │   │   └── audit.js         # injeção de audit log
│   │   ├── modules/
│   │   │   ├── auth/            # login CPF, verificação email, recuperação senha
│   │   │   ├── clients/         # CRUD clientes (master only)
│   │   │   ├── users/           # CRUD usuários com cotas
│   │   │   ├── events/          # CRUD eventos + configuração
│   │   │   ├── event-config/    # configurações de validação por evento
│   │   │   ├── event-team/      # designação de equipe a eventos
│   │   │   ├── gates/           # abertura e fechamento de portões
│   │   │   ├── batches/         # gestão de lotes
│   │   │   ├── tickets/         # gestão de ingressos
│   │   │   ├── import/          # importação CSV/XLSX (v1 corrigida)
│   │   │   ├── master-tickets/  # ingresso master
│   │   │   ├── invitations/     # convite avulso + liberação em lista
│   │   │   ├── validation/      # check-in e check-out (v1 corrigida)
│   │   │   ├── sync/            # snapshot + logs offline
│   │   │   ├── dashboard/       # métricas em tempo real
│   │   │   ├── reports/         # geração MD e CSV
│   │   │   └── audit/           # consulta do log de auditoria
│   │   ├── utils/
│   │   │   ├── validation.js    # isValidUUID, isValidCPF
│   │   │   ├── hash.js          # hashCPF com bcrypt
│   │   │   ├── email.js         # wrapper Resend
│   │   │   └── logger.js
│   │   └── app.js
│   ├── migrations/
│   │   ├── 001_initial_v1.sql
│   │   ├── 002_uuid_only.sql
│   │   └── 003_v2_schema.sql    # todas as novas tabelas da v2
│   ├── Dockerfile.backend
│   ├── railway.json
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── master/
    │   │   │   ├── MasterDashboard.jsx
    │   │   │   └── ClientsManager.jsx
    │   │   ├── admin/
    │   │   │   ├── AdminDashboard.jsx
    │   │   │   ├── EventManager.jsx      # criar/editar evento + config
    │   │   │   ├── TeamManager.jsx
    │   │   │   ├── BatchManager.jsx
    │   │   │   ├── TicketsManager.jsx
    │   │   │   └── AdminConfig.jsx       # configurações gerais
    │   │   ├── supervisor/
    │   │   │   ├── EventDashboard.jsx    # dashboard em tempo real
    │   │   │   ├── GatesPanel.jsx
    │   │   │   └── ReportsPanel.jsx
    │   │   └── terminal/
    │   │       └── Terminal.jsx          # portaria (validador)
    │   ├── components/
    │   │   ├── QRScanner.jsx
    │   │   ├── ValidationResult.jsx      # corrigido BUG-01
    │   │   ├── SearchPanel.jsx
    │   │   ├── SyncStatus.jsx
    │   │   ├── MasterTicketButton.jsx
    │   │   └── dashboard/
    │   │       ├── SummaryCards.jsx
    │   │       ├── EntryChart.jsx
    │   │       ├── BatchTable.jsx
    │   │       ├── AlertsFeed.jsx
    │   │       ├── LiveFeed.jsx
    │   │       └── TerminalsStatus.jsx
    │   ├── services/
    │   │   ├── api.js
    │   │   ├── localDB.js               # Dexie schema atualizado
    │   │   └── syncService.js
    │   ├── store/
    │   │   ├── authStore.js
    │   │   ├── eventStore.js            # config do evento ativo
    │   │   ├── terminalStore.js
    │   │   └── syncStore.js
    │   └── hooks/
    │       ├── useSync.js
    │       ├── useValidation.js
    │       └── useOffline.js
    ├── Dockerfile.frontend
    ├── nginx.conf
    ├── railway.json
    └── package.json
```

---

## 4. API REST — Endpoints

### 4.1 Autenticação

```
POST  /api/auth/login               # CPF + senha → JWT
POST  /api/auth/logout
GET   /api/auth/me
POST  /api/auth/verify-email        # token de ativação
POST  /api/auth/resend-verification
POST  /api/auth/forgot-password
POST  /api/auth/reset-password
```

**POST /api/auth/login**
```json
// Request — CPF com ou sem formatação
{ "cpf": "111.222.333-44", "password": "senha123" }

// Response 200
{
  "token": "eyJhbGci...",
  "user": {
    "id": "uuid",
    "name": "João Silva",
    "role": "supervisor",
    "tenant_id": "uuid",
    "email_verified": true
  }
}

// Response 403 — e-mail não verificado
{ "error": "email_not_verified" }
```

---

### 4.2 Clientes (Master only)

```
GET    /api/clients
POST   /api/clients
GET    /api/clients/:id
PUT    /api/clients/:id
PATCH  /api/clients/:id/suspend
PATCH  /api/clients/:id/activate
GET    /api/clients/:id/usage
```

---

### 4.3 Usuários

```
GET    /api/users                   # lista usuários do tenant
POST   /api/users                   # cria + envia e-mail de ativação
GET    /api/users/:id
PUT    /api/users/:id
PATCH  /api/users/:id/deactivate
```

---

### 4.4 Eventos

```
GET    /api/events
POST   /api/events
GET    /api/events/:id
PUT    /api/events/:id
PATCH  /api/events/:id/status       # draft→active→closed
GET    /api/events/:id/config
PUT    /api/events/:id/config
GET    /api/events/:id/team
POST   /api/events/:id/team
DELETE /api/events/:id/team/:userId
```

---

### 4.5 Ingressos e Lotes

```
GET    /api/events/:id/batches
POST   /api/events/:id/batches
PUT    /api/events/:id/batches/:batchId
DELETE /api/events/:id/batches/:batchId

GET    /api/events/:id/tickets      # com filtros e paginação
PATCH  /api/events/:id/tickets/:ticketId/block
PATCH  /api/events/:id/tickets/:ticketId/unblock
POST   /api/import/csv              # mantém endpoint v1
```

---

### 4.6 Ingressos de Emergência

```
GET    /api/events/:id/master-ticket
POST   /api/events/:id/master-ticket
PATCH  /api/events/:id/master-ticket/use    # registra uso
DELETE /api/events/:id/master-ticket        # desativa

POST   /api/events/:id/invitations          # convite avulso
POST   /api/events/:id/invitations/bulk     # liberação em lista
```

**POST /api/events/:id/invitations**
```json
// Request
{ "display_name": "Maria Santos", "cpf": "111.222.333-44" }

// Response 201
{
  "ticket_code": "uuid-gerado",
  "display_name": "Maria Santos",
  "origin": "cortesia",
  "status": "active",
  "qrcode_data": "uuid-gerado"
}
```

---

### 4.7 Validação (corrigida do BUG-01)

```
POST  /api/validation/qrcode
POST  /api/validation/manual
POST  /api/validation/checkout
GET   /api/validation/search
POST  /api/validation/master
```

**POST /api/validation/qrcode — resposta corrigida**
```json
// Entrada autorizada
{
  "status": "authorized",
  "ticket_code": "uuid",
  "display_name": "Carlos S.",
  "batch": "LOTE-01",
  "entry_log_id": "uuid"
}

// CORRIGIDO BUG-01: duplicata agora retorna status correto
{
  "status": "duplicate",
  "ticket_code": "uuid",
  "display_name": "Carlos S.",
  "first_entry_at": "2026-06-29T14:32:11Z",
  "entry_log_id": "uuid"
}

// Bloqueado
{ "status": "blocked", "ticket_code": "uuid" }

// Não encontrado
{ "status": "not_found" }
```

**POST /api/validation/checkout**
```json
// Request
{ "ticket_code": "uuid", "event_id": "uuid", "terminal_id": "uuid" }

// Response 200
{
  "status": "checkout_registered",
  "ticket_code": "uuid",
  "display_name": "Carlos S.",
  "entry_at": "2026-06-29T14:32:11Z",
  "checkout_at": "2026-06-29T18:45:00Z"
}
```

**POST /api/validation/master**
```json
// Request
{
  "event_id": "uuid",
  "terminal_id": "uuid",
  "validator_id": "uuid",
  "beneficiary_name": "Pedro Alves"
}

// Response 200
{
  "status": "authorized",
  "entry_type": "master",
  "uses_remaining": null,
  "entry_log_id": "uuid"
}
```

---

### 4.8 Portões

```
GET   /api/events/:id/gates
POST  /api/events/:id/gates
PATCH /api/events/:id/gates/:gateId/open
PATCH /api/events/:id/gates/:gateId/close
```

---

### 4.9 Dashboard

```
GET   /api/events/:id/dashboard/summary
GET   /api/events/:id/dashboard/flow
GET   /api/events/:id/dashboard/batches
GET   /api/events/:id/dashboard/alerts
GET   /api/events/:id/dashboard/terminals
GET   /api/events/:id/dashboard/live-feed
```

---

### 4.10 Relatórios

```
GET   /api/events/:id/reports/md
GET   /api/events/:id/reports/csv
GET   /api/events/:id/reports/audit
```

**GET /api/events/:id/reports/md**

Retorna `Content-Type: text/markdown` com o relatório completo:

```markdown
# Relatório de Evento — [Nome do Evento]
**Data:** 29/06/2026 | **Local:** [Local]

## Resumo Geral
| Métrica | Valor |
|---|---|
| Total de ingressos | 1045 |
| Validados | 987 |
| Ocupação | 94,4% |
| Duplicatas detectadas | 3 |
| Ingressos master usados | 2 |
| Cortesias geradas | 5 |

## Portões
| Portão | Abertura | Fechamento | Responsável |
|---|---|---|---|
| Portão Principal | 14:00:12 | 18:30:45 | João Silva |

## Fluxo por Hora
| Hora | Entradas | Saídas |
|---|---|---|
| 14:00 | 312 | 0 |
| 15:00 | 287 | 45 |
...

## Ocorrências
...

## Log Completo de Validações
...
```

---

### 4.11 Sync e Heartbeat

```
GET   /api/sync/snapshot            # tickets atualizados desde 'since'
POST  /api/sync/logs                # envia logs offline
POST  /api/sync/heartbeat
GET   /health                       # keep-alive (BUG-05 relacionado)
```

---

## 5. Lógica de Validação — Máquina de Estados

A lógica de check-in e reentrada depende da configuração `reentry_mode` do evento:

```
Ingresso lido
      │
      ▼
status = 'blocked' ──────────────────► retorna 'blocked'
      │
status = 'active' ───────────────────► AUTORIZAR
      │                                  │ atualiza status → 'validated'
      │                                  │ grava entry_log
      │                                  └► retorna 'authorized'
      │
status = 'validated'
      │
      ├── reentry_mode = 'none' ──────► retorna 'duplicate' (BUG-01 corrigido)
      │
      ├── reentry_mode = 'free' ──────► AUTORIZAR (nova entrada)
      │                                  │ grava entry_log com is_duplicate=false
      │                                  └► retorna 'authorized'
      │
      └── reentry_mode = 'conditioned'
                │
                ├── tem checkout_at ──► AUTORIZAR (reentrada válida)
                │                        │ zera checkout_at
                │                        └► retorna 'authorized'
                │
                └── sem checkout_at ──► retorna 'duplicate'
```

---

## 6. Estratégia Offline — IndexedDB v2

### 6.1 Schema Dexie atualizado

```javascript
// localDB.js
const db = new Dexie('validevento_db');

db.version(2).stores({
  tickets:      '++id, ticket_code, status, event_id, origin',
  entry_logs:   '++id, ticket_id, synced, created_at',
  meta:         'key',
  // Armazena: last_sync_at, event_id, terminal_id, event_config
});
```

### 6.2 Config do evento no IndexedDB

A config do evento (incluindo `reentry_mode`, `checkout_enabled`, `qrcode_field`) é salva localmente no sync, para que o terminal opere corretamente offline:

```javascript
// Salvo em meta com key = 'event_config'
{
  reentry_mode: 'conditioned',
  checkout_enabled: true,
  qrcode_field: 'ticket_code',
  manual_fields: ['display_name'],
  duplicate_action: 'warn',
  master_ticket_enabled: true
}
```

### 6.3 Validação offline com reentry_mode

```javascript
async function validateOffline(ticketCode, eventConfig) {
  const ticket = await db.tickets
    .where('ticket_code').equalsIgnoreCase(ticketCode).first();

  if (!ticket) return { status: 'not_found' };
  if (ticket.status === 'blocked') return { status: 'blocked' };

  if (ticket.status === 'active') {
    await db.tickets.update(ticket.id, {
      status: 'validated',
      validated_at: new Date()
    });
    await db.entry_logs.add({
      ticket_id: ticket.id,
      entry_type: 'qrcode',
      synced: 0,
      created_at: new Date()
    });
    return { status: 'authorized', display_name: ticket.display_name };
  }

  // status = 'validated' — aplica reentry_mode
  if (eventConfig.reentry_mode === 'none') {
    return { status: 'duplicate', first_entry_at: ticket.validated_at };
  }

  if (eventConfig.reentry_mode === 'free') {
    await db.entry_logs.add({
      ticket_id: ticket.id, entry_type: 'qrcode',
      synced: 0, created_at: new Date()
    });
    return { status: 'authorized', display_name: ticket.display_name };
  }

  if (eventConfig.reentry_mode === 'conditioned') {
    if (!ticket.checkout_at) {
      return { status: 'duplicate', first_entry_at: ticket.validated_at };
    }
    await db.tickets.update(ticket.id, { checkout_at: null });
    await db.entry_logs.add({
      ticket_id: ticket.id, entry_type: 'qrcode',
      synced: 0, created_at: new Date()
    });
    return { status: 'authorized', display_name: ticket.display_name };
  }
}
```

---

## 7. Autenticação com CPF

### 7.1 Hash do CPF

O CPF é usado como identificador de login mas nunca armazenado em texto puro:

```javascript
// utils/hash.js
const bcrypt = require('bcryptjs');

// Hash na criação do usuário (lento por design — bcrypt)
async function hashCPF(cpf) {
  const clean = cpf.replace(/\D/g, '');
  return bcrypt.hash(clean, 12);
}

// Comparação no login
async function compareCPF(cpfInput, storedHash) {
  const clean = cpfInput.replace(/\D/g, '');
  return bcrypt.compare(clean, storedHash);
}
```

> **Atenção:** bcrypt é intencialmente lento. Para busca por CPF o sistema
> não pode fazer `SELECT * FROM users WHERE cpf_hash = $1` com bcrypt puro
> (não é reversível). A solução é usar um hash rápido (SHA-256 com salt fixo
> por sistema) para lookup, e bcrypt separado para verificação de senha.
> O CPF não é exposto em nenhuma resposta da API.

### 7.2 Estratégia de lookup por CPF

```javascript
// CPF lookup: SHA-256 com salt fixo do sistema (para indexação)
const crypto = require('crypto');

function cpfLookupHash(cpf) {
  const clean = cpf.replace(/\D/g, '');
  return crypto.createHash('sha256')
    .update(clean + process.env.CPF_LOOKUP_SALT)
    .digest('hex');
}

// users tabela terá coluna adicional:
// cpf_lookup_hash VARCHAR(64) UNIQUE  ← SHA-256 para busca rápida
// cpf_hash        VARCHAR(255)        ← bcrypt para verificação (opcional, redundante)
```

### 7.3 E-mail de ativação (Resend)

```javascript
// utils/email.js
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendActivationEmail(to, name, token) {
  const link = `${process.env.FRONTEND_URL}/ativar?token=${token}`;
  await resend.emails.send({
    from: 'Validevento <noreply@seudominio.com>',
    to,
    subject: 'Ative seu acesso — Validevento',
    html: `
      <p>Olá, ${name}!</p>
      <p>Clique no link abaixo para ativar seu acesso:</p>
      <a href="${link}">${link}</a>
      <p>Este link expira em 48 horas.</p>
    `
  });
}
```

---

## 8. Middleware de Tenant

Toda requisição autenticada injeta o `tenant_id` no contexto, garantindo isolamento:

```javascript
// middleware/auth.js
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    req.tenantId = payload.tenant_id; // null para master
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// middleware/roles.js
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Queries sempre filtradas por tenant_id
// Ex: SELECT * FROM events WHERE tenant_id = $1 AND id = $2
```

---

## 9. Correções Obrigatórias da v1

### BUG-01 — Duplicata retorna status errado

```javascript
// validation.service.js — ANTES (errado)
if (ticket.status === 'validated') {
  // gravava log com is_duplicate: true mas...
  return { status: 'authorized', ... }; // ← errado
}

// DEPOIS (correto)
if (ticket.status === 'validated') {
  await client.query(`INSERT INTO entry_logs (..., is_duplicate) VALUES (..., true)`);
  await client.query('COMMIT');
  return {
    status: 'duplicate',           // ← corrigido
    ticket_code: ticket.ticket_code,
    display_name: ticket.display_name,
    first_entry_at: ticket.validated_at
  };
}
```

### BUG-02 — CORS aberto em produção

```javascript
// app.js
app.use(cors({
  origin: process.env.CORS_ORIGIN, // nunca '*' em produção
  methods: ['GET','POST','PUT','PATCH','DELETE'],
  allowedHeaders: ['Content-Type','Authorization']
}));
```

```bash
# backend/.env — produção
CORS_ORIGIN=https://seu-frontend.vercel.app
```

### BUG-03 — Validação de MIME type rejeita arquivos válidos

```javascript
// import.controller.js
function isValidFileType(mimetype, originalname) {
  const validMimes = [
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/json',
    'text/xml',
    'application/xml',
    'text/plain',             // ← CSV enviado por alguns browsers mobile
    'application/octet-stream' // ← XLSX enviado por alguns sistemas
  ];

  const validExtensions = ['.csv', '.xlsx', '.xls', '.json', '.xml'];
  const ext = path.extname(originalname || '').toLowerCase();

  // Aceita se MIME válido OU extensão válida
  return validMimes.includes(mimetype) || validExtensions.includes(ext);
}
```

### BUG-05 — Docker Compose incompleto para dev local

```yaml
# docker-compose.yml — atualizado
services:
  db:
    image: postgres:15-alpine
    container_name: validevento-db
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: validevento
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: validevento-backend
    restart: always
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:postgres@db:5432/validevento
    env_file:
      - backend/.env
    depends_on:
      - db

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    container_name: validevento-frontend
    restart: always
    ports:
      - "5173:80"
    depends_on:
      - backend

volumes:
  pgdata:
```

---

## 10. Keep-Alive (Railway Hobby)

### Endpoint no backend

```javascript
// app.js
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

### Configuração no cron-job.org

```
URL:       https://seu-backend.railway.app/health
Método:    GET
Intervalo: A cada 5 minutos
Ativo:     Sempre (ou por agendamento no dia do evento)
```

---

## 11. Variáveis de Ambiente

```bash
# backend/.env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...supabase...
JWT_SECRET=string-256-bits-aleatorio
JWT_EXPIRES_IN=24h
CORS_ORIGIN=https://seu-frontend.vercel.app   # nunca '*'
RESEND_API_KEY=re_xxxxxxxx
CPF_LOOKUP_SALT=string-aleatoria-fixa-por-sistema
FRONTEND_URL=https://seu-frontend.vercel.app

# frontend/.env
VITE_API_URL=https://seu-backend.railway.app
VITE_EVENT_ID=                                # opcional
```

---

## 12. Plano de Testes v2

| Teste | Cenário | Critério |
|---|---|---|
| T-01 | Importar XLSX com colunas `Codigo`/`Nome` | 1045 inseridos, 0 erros |
| T-02 | Importar CSV enviado por browser mobile | Aceito sem erro de MIME |
| T-03 | Validar QRCode válido | Retorna `authorized` em < 1s |
| T-04 | Validar mesmo QRCode duas vezes (reentry=none) | Segundo retorna `duplicate` |
| T-05 | Validar mesmo QRCode com reentry=free | Segundo retorna `authorized` |
| T-06 | Validar com reentry=conditioned sem checkout | Retorna `duplicate` |
| T-07 | Checkout + reentrada com reentry=conditioned | Reentrada retorna `authorized` |
| T-08 | Usar ingresso master | Log com `entry_type: master` + contador atualizado |
| T-09 | Gerar convite avulso e usar imediatamente | Validação imediata com `origin: cortesia` |
| T-10 | Validar offline (rede cortada) | Resposta < 1s, log enfileirado |
| T-11 | Reconectar após 15min offline | Sync automático, logs enviados |
| T-12 | Login com CPF formatado (111.222.333-44) | Autenticação bem-sucedida |
| T-13 | Login sem e-mail verificado | Retorna `email_not_verified` |
| T-14 | Admin tenta criar usuário acima da cota | Retorna erro com cota disponível |
| T-15 | Gerar relatório MD de evento com 3000 ingressos | Gerado em < 15s |
| T-16 | CORS bloqueando origem não autorizada | Request bloqueado |
| T-17 | Validador acessa rota de dashboard | Retorna 403 |
| T-18 | 10 terminais validando simultaneamente | Sem duplicata ou conflito |

---

## 13. Ordem de Implementação Sugerida

```
Fase 1 — Fundação (sem quebrar a v1 em produção)
  1.  Migration 003_v2_schema.sql (novas tabelas, colunas adicionais)
  2.  Correções obrigatórias: BUG-01, BUG-02, BUG-03, BUG-05
  3.  Módulo clients (CRUD + cotas)
  4.  Autenticação CPF + e-mail (Resend)
  5.  Hierarquia de perfis atualizada (master adicionado)
  6.  Painel Master (frontend)

Fase 2 — Gestão de evento
  7.  Configuração de evento (event_config)
  8.  Designação de equipe (event_team)
  9.  Gestão de portões (gates)
  10. Ingresso master (master_tickets)
  11. Gerador de convite avulso (invitations)
  12. Liberação em lista (invitations/bulk)

Fase 3 — Terminal e checkout
  13. Lógica de reentry_mode no backend
  14. Checkout (validation/checkout)
  15. Terminal atualizado no frontend
  16. Config do evento no IndexedDB (offline)

Fase 4 — Relatórios e auditoria
  17. Geração de relatório MD
  18. Exportação CSV
  19. Log de auditoria (audit_logs)

Fase 5 — Deploy e testes
  20. Keep-alive /health + cron-job.org
  21. Testes T-01 a T-18
  22. Deploy Vercel (frontend) + Railway (backend)
```
