# Spec Técnica — Sistema de Validação de Portaria
## Technical Specification v1.0

---

## 1. Stack Tecnológica Definitiva

### 1.1 Visão geral

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                 │
│                                                                 │
│   React 18 + Vite    │   Tailwind CSS   │   PWA (Workbox)      │
│   React Router v6    │   Zustand        │   IndexedDB (Dexie)  │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTPS
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                 │
│                                                                 │
│   Node.js 20 + Express 4   │   JWT Auth   │   Multer (CSV)     │
│   node-cron (sync)         │   bcrypt     │   csv-parse        │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        BANCO DE DADOS                           │
│                                                                 │
│   PostgreSQL 15 (Supabase)  │  Schema versionado (migrations)  │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                          DEPLOY                                 │
│                                                                 │
│   Backend: Railway          │   Frontend: Vercel               │
│   DB: Supabase (managed)    │   CDN: automático                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Justificativa das escolhas

| Tecnologia | Por quê |
|---|---|
| **Supabase** | PostgreSQL gerenciado, gratuito na escala do evento, real-time nativo, backups automáticos |
| **PWA + Workbox** | Sem instalação nos dispositivos, funciona offline, câmera acessível via browser |
| **Dexie.js** | Wrapper elegante para IndexedDB, queries simples, sync confiável |
| **Zustand** | State management leve, sem boilerplate do Redux |
| **Railway** | Deploy Node.js em 2 comandos, zero DevOps, logs integrados |
| **Vercel** | Deploy frontend automático via Git, CDN global, HTTPS automático |

---

## 2. Modelagem de Dados

### 2.1 Diagrama de entidades

```
┌─────────────────┐       ┌──────────────────┐       ┌────────────────┐
│     events      │       │    tickets        │       │  entry_logs    │
├─────────────────┤       ├──────────────────┤       ├────────────────┤
│ id (uuid) PK    │──┐    │ id (uuid) PK     │──┐    │ id (uuid) PK   │
│ name            │  │    │ event_id FK      │◄─┘    │ ticket_id FK   │◄┐
│ date            │  └───►│ ticket_code      │       │ event_id FK    │ │
│ location        │       │ batch            │       │ hash_cpf       │ │
│ capacity        │       │ hash_cpf         │       │ entry_type     │ │
│ salt            │       │ display_name     │       │ terminal_id    │ │
│ created_at      │       │ status           │       │ validator_id   │ │
└─────────────────┘       │ imported_at      │       │ is_duplicate   │ │
                          │ validated_at     │       │ synced         │ │
┌─────────────────┐       │ updated_at       │       │ created_at     │ │
│     users       │       └──────────────────┘       └────────────────┘ │
├─────────────────┤                                                       │
│ id (uuid) PK    │───────────────────────────────────────────────────────┘
│ name            │
│ email           │       ┌──────────────────┐
│ password_hash   │       │    terminals     │
│ role            │       ├──────────────────┤
│ active          │       │ id (uuid) PK     │
│ created_at      │       │ name             │
└─────────────────┘       │ last_seen_at     │
                          │ last_sync_at     │
                          │ online           │
                          └──────────────────┘
```

### 2.2 Detalhamento das tabelas

#### `events`
```sql
CREATE TABLE events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  date          TIMESTAMPTZ NOT NULL,
  location      VARCHAR(255),
  capacity      INTEGER NOT NULL DEFAULT 1000,
  salt          VARCHAR(64) NOT NULL, -- salt único por evento para hash CPF
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

#### `tickets`
```sql
CREATE TABLE tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id),
  ticket_code   VARCHAR(50) NOT NULL UNIQUE, -- ex: EVT2026-004521
  batch         VARCHAR(50) NOT NULL,         -- ex: LOTE-03
  hash_cpf      VARCHAR(64),                  -- NULL se ainda não vinculado
  display_name  VARCHAR(100),                 -- ex: "Carlos S." — nome parcial
  status        VARCHAR(20) NOT NULL DEFAULT 'generated',
  -- generated | linked | validated | blocked
  imported_at   TIMESTAMPTZ DEFAULT now(),
  validated_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_status CHECK (
    status IN ('generated', 'linked', 'validated', 'blocked')
  )
);

CREATE INDEX idx_tickets_hash_cpf ON tickets(hash_cpf);
CREATE INDEX idx_tickets_status   ON tickets(status);
CREATE INDEX idx_tickets_event    ON tickets(event_id);
```

#### `entry_logs`
```sql
CREATE TABLE entry_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID NOT NULL REFERENCES tickets(id),
  event_id      UUID NOT NULL REFERENCES events(id),
  hash_cpf      VARCHAR(64) NOT NULL,
  entry_type    VARCHAR(20) NOT NULL,  -- qrcode | manual
  terminal_id   UUID REFERENCES terminals(id),
  validator_id  UUID REFERENCES users(id),
  is_duplicate  BOOLEAN DEFAULT false,
  synced        BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_logs_hash_cpf ON entry_logs(hash_cpf);
CREATE INDEX idx_logs_event    ON entry_logs(event_id);
CREATE INDEX idx_logs_synced   ON entry_logs(synced);
```

#### `users`
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'validator',
  -- admin | supervisor | validator
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

#### `terminals`
```sql
CREATE TABLE terminals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id),
  name          VARCHAR(100) NOT NULL,  -- ex: "Portaria 1 - Celular João"
  last_seen_at  TIMESTAMPTZ,
  last_sync_at  TIMESTAMPTZ,
  online        BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

---

## 3. Estrutura de Projeto

```
/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js        # conexão PostgreSQL
│   │   │   └── env.js             # variáveis de ambiente
│   │   ├── middleware/
│   │   │   ├── auth.js            # JWT verify
│   │   │   └── roles.js           # controle por perfil
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.routes.js
│   │   │   │   ├── auth.controller.js
│   │   │   │   └── auth.service.js
│   │   │   ├── tickets/
│   │   │   │   ├── tickets.routes.js
│   │   │   │   ├── tickets.controller.js
│   │   │   │   └── tickets.service.js
│   │   │   ├── validation/
│   │   │   │   ├── validation.routes.js
│   │   │   │   ├── validation.controller.js
│   │   │   │   └── validation.service.js
│   │   │   ├── sync/
│   │   │   │   ├── sync.routes.js
│   │   │   │   ├── sync.controller.js
│   │   │   │   └── sync.service.js
│   │   │   ├── dashboard/
│   │   │   │   ├── dashboard.routes.js
│   │   │   │   └── dashboard.controller.js
│   │   │   └── import/
│   │   │       ├── import.routes.js
│   │   │       ├── import.controller.js
│   │   │       └── import.service.js
│   │   ├── utils/
│   │   │   ├── hash.js            # SHA-256 com salt
│   │   │   └── logger.js
│   │   └── app.js
│   ├── migrations/
│   ├── package.json
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Terminal.jsx       # portaria — tela principal
    │   │   ├── Dashboard.jsx      # ADM
    │   │   └── Users.jsx          # gestão de usuários
    │   ├── components/
    │   │   ├── QRScanner.jsx      # câmera + leitura
    │   │   ├── ValidationResult.jsx
    │   │   ├── SearchPanel.jsx    # busca manual
    │   │   ├── SyncStatus.jsx     # indicador online/offline
    │   │   └── dashboard/
    │   │       ├── SummaryCards.jsx
    │   │       ├── EntryChart.jsx
    │   │       ├── BatchTable.jsx
    │   │       ├── AlertsFeed.jsx
    │   │       └── LiveFeed.jsx
    │   ├── store/
    │   │   ├── authStore.js
    │   │   ├── terminalStore.js
    │   │   └── syncStore.js
    │   ├── services/
    │   │   ├── api.js             # axios instance
    │   │   ├── localDB.js         # Dexie (IndexedDB)
    │   │   ├── syncService.js     # lógica de sync
    │   │   └── hashService.js     # hash CPF no cliente
    │   ├── hooks/
    │   │   ├── useSync.js
    │   │   ├── useValidation.js
    │   │   └── useOffline.js
    │   ├── sw.js                  # Service Worker (Workbox)
    │   └── main.jsx
    ├── public/
    │   ├── manifest.json          # PWA manifest
    │   └── icons/
    ├── vite.config.js
    └── package.json
```

---

## 4. API REST — Endpoints

### 4.1 Autenticação

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
```

**POST /api/auth/login**
```json
// Request
{ "email": "validador@evento.com", "password": "senha123" }

// Response 200
{
  "token": "eyJhbGci...",
  "user": { "id": "uuid", "name": "João", "role": "validator" }
}
```

---

### 4.2 Importação CSV

```
POST   /api/import/csv          [admin]
GET    /api/import/history      [admin]
```

**POST /api/import/csv**
- Content-Type: `multipart/form-data`
- Campo: `file` (CSV), `event_id`

```json
// Response 200
{
  "inserted": 450,
  "updated": 120,
  "skipped": 5,
  "errors": [
    { "line": 23, "reason": "hash_cpf inválido" }
  ],
  "duration_ms": 1840
}
```

---

### 4.3 Validação

```
POST   /api/validation/qrcode   [validator, supervisor, admin]
POST   /api/validation/manual   [validator, supervisor, admin]
GET    /api/validation/search   [validator, supervisor, admin]
```

**POST /api/validation/qrcode**
```json
// Request
{
  "cpf_raw": "111.222.333-44",
  "event_id": "uuid",
  "terminal_id": "uuid"
}

// Response 200 — entrada autorizada
{
  "status": "authorized",
  "ticket_code": "EVT2026-004521",
  "display_name": "Carlos S.",
  "batch": "LOTE-03",
  "entry_log_id": "uuid"
}

// Response 200 — duplicata
{
  "status": "duplicate",
  "ticket_code": "EVT2026-004521",
  "display_name": "Carlos S.",
  "first_entry_at": "2026-06-29T14:32:11Z",
  "entry_log_id": "uuid"
}

// Response 404 — não encontrado
{
  "status": "not_found"
}

// Response 403 — ingresso bloqueado
{
  "status": "blocked",
  "ticket_code": "EVT2026-004521"
}
```

**GET /api/validation/search**
```
?q=carlos&event_id=uuid          # busca por nome
?cpf=11122233344&event_id=uuid   # busca por CPF
```

```json
// Response 200
{
  "results": [
    {
      "ticket_id": "uuid",
      "ticket_code": "EVT2026-004521",
      "display_name": "Carlos S.",
      "batch": "LOTE-03",
      "status": "linked"
    }
  ]
}
```

---

### 4.4 Sync

```
GET    /api/sync/snapshot        [validator, supervisor, admin]
POST   /api/sync/logs            [validator, supervisor, admin]
POST   /api/sync/heartbeat       [validator, supervisor, admin]
```

**GET /api/sync/snapshot**
```
?event_id=uuid&since=2026-06-29T13:00:00Z
```
Retorna apenas registros alterados desde `since`. Primeira sync omite `since` e retorna tudo.

```json
// Response 200
{
  "tickets": [ ...array de tickets alterados... ],
  "last_sync_at": "2026-06-29T14:00:00Z",
  "total": 87
}
```

**POST /api/sync/logs**
Envia logs de entrada gerados offline para o servidor.

```json
// Request
{
  "event_id": "uuid",
  "terminal_id": "uuid",
  "logs": [
    {
      "local_id": "uuid-local",
      "ticket_id": "uuid",
      "hash_cpf": "e3b0c...",
      "entry_type": "qrcode",
      "created_at": "2026-06-29T14:17:33Z"
    }
  ]
}
```

---

### 4.5 Dashboard

```
GET    /api/dashboard/summary    [admin, supervisor]
GET    /api/dashboard/batches    [admin, supervisor]
GET    /api/dashboard/flow       [admin, supervisor]
GET    /api/dashboard/alerts     [admin, supervisor]
GET    /api/dashboard/terminals  [admin, supervisor]
GET    /api/dashboard/live-feed  [admin, supervisor]
GET    /api/dashboard/export     [admin]
```

---

## 5. Estratégia Offline — Terminal de Portaria

### 5.1 IndexedDB com Dexie.js

```javascript
// localDB.js
const db = new Dexie('portaria_db');

db.version(1).stores({
  tickets:    '++id, ticket_code, hash_cpf, status, event_id',
  entry_logs: '++id, ticket_id, hash_cpf, synced, created_at',
  meta:       'key'  // last_sync_at, event_id, terminal_id
});
```

### 5.2 Fluxo de validação offline-first

```
QRCode lido (CPF raw)
        │
        ▼
Hash CPF no cliente (SHA-256 + salt do evento)
        │
        ▼
Consulta IndexedDB local (< 10ms)
        │
        ├──► Encontrado
        │         │
        │         ├── status: linked    ──► AUTORIZAR
        │         │     │ atualiza status local para 'validated'
        │         │     │ grava entry_log local (synced: false)
        │         │     └──► tenta sync em background
        │         │
        │         ├── status: validated ──► DUPLICATA
        │         │
        │         └── status: blocked   ──► BLOQUEAR
        │
        └──► Não encontrado ──────────────► NÃO ENCONTRADO
```

### 5.3 Estratégia de sync

```javascript
// syncService.js — executado a cada 60min ou manualmente
async function syncWithServer() {
  const lastSync = await db.meta.get('last_sync_at');

  // 1. Envia logs offline pendentes
  const pendingLogs = await db.entry_logs
    .where('synced').equals(0).toArray();

  if (pendingLogs.length > 0) {
    await api.post('/sync/logs', { logs: pendingLogs });
    await db.entry_logs.where('synced').equals(0)
      .modify({ synced: 1 });
  }

  // 2. Baixa snapshot atualizado
  const snapshot = await api.get('/sync/snapshot', {
    params: { event_id, since: lastSync?.value }
  });

  // 3. Atualiza base local (sem sobrescrever 'validated' local)
  for (const ticket of snapshot.tickets) {
    const local = await db.tickets
      .where('ticket_code').equals(ticket.ticket_code).first();

    if (!local || local.status !== 'validated') {
      await db.tickets.put(ticket);
    }
  }

  // 4. Atualiza timestamp
  await db.meta.put({ key: 'last_sync_at', value: snapshot.last_sync_at });
}
```

---

## 6. Segurança e LGPD

### 6.1 Hash do CPF

```javascript
// utils/hash.js
const crypto = require('crypto');

function hashCPF(cpf, eventSalt) {
  const cpfClean = cpf.replace(/\D/g, ''); // remove pontuação
  return crypto
    .createHash('sha256')
    .update(cpfClean + eventSalt)
    .digest('hex');
}
```

> O `eventSalt` é único por evento, gerado na criação. Isso garante que o mesmo CPF gere hashes diferentes em eventos distintos, impossibilitando rastreamento cruzado entre eventos.

### 6.2 Fluxo de dados sensíveis

```
CPF em claro ──► NUNCA sai do sistema interno da empresa
                  │
                  │ apenas hash viaja para o sistema de validação
                  ▼
hash_cpf ──────► armazenado no banco de validação
                  │
                  │ apenas no terminal, na tela do validador
                  ▼
display_name ──► "Carlos S." (nome parcial — apenas para confirmação visual)
```

### 6.3 Autenticação e autorização

```javascript
// Middleware de autenticação
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware de perfil
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};
```

---

## 7. PWA — Configuração Essencial

### 7.1 manifest.json
```json
{
  "name": "Portaria — Validação de Ingressos",
  "short_name": "Portaria",
  "start_url": "/terminal",
  "display": "fullscreen",
  "orientation": "portrait",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 7.2 Service Worker (Workbox)
```javascript
// vite.config.js
import { VitePWA } from 'vite-plugin-pwa';

VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    runtimeCaching: [{
      urlPattern: /^https:\/\/api\./,
      handler: 'NetworkFirst',        // tenta rede, cai para cache
      options: { cacheName: 'api-cache', networkTimeoutSeconds: 3 }
    }]
  }
})
```

---

## 8. Formato do CSV de Importação

```csv
ticket_code,batch,hash_cpf,display_name,status
EVT2026-000001,LOTE-01,e3b0c44298fc1c...,Maria O.,linked
EVT2026-000002,LOTE-01,,,generated
EVT2026-000003,LOTE-01,a87ff679a2f3e7...,João S.,linked
```

**Regras de validação do CSV:**
- Linha 1 obrigatoriamente é o cabeçalho
- `ticket_code` obrigatório e único
- `batch` obrigatório
- `hash_cpf` e `display_name` podem ser vazios (ingresso sem CPF vinculado)
- `status` deve ser `generated`, `linked` ou `blocked`
- Encoding: UTF-8

---

## 9. Variáveis de Ambiente

```bash
# backend/.env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
JWT_SECRET=string-aleatoria-forte-256bits
JWT_EXPIRES_IN=24h
CORS_ORIGIN=https://portaria.seudominio.com

# frontend/.env
VITE_API_URL=https://api.seudominio.com
VITE_EVENT_ID=uuid-do-evento-ativo
```

---

## 10. Plano de Testes

| Teste | Cenário | Critério |
|---|---|---|
| **T-01** | Importar CSV de 1.000 linhas | Processado < 10s, sem erros em dados válidos |
| **T-02** | Validar QRCode válido | Resposta verde < 1s |
| **T-03** | Validar mesmo QRCode duas vezes | Segundo retorna duplicata |
| **T-04** | Validar QRCode com rede cortada | Resposta local < 1s |
| **T-05** | Reconectar após 10min offline | Sync automático, logs enviados |
| **T-06** | Busca por nome parcial | Retorna resultados corretos |
| **T-07** | Busca por CPF com e sem pontuação | Mesmo resultado |
| **T-08** | Login com perfil validator | Sem acesso ao dashboard |
| **T-09** | 6 terminais validando simultaneamente | Sem conflito de dados |
| **T-10** | Importar CSV corrompido | Rejeita com mensagem clara, base intacta |
| **T-11** | Ingresso com status `generated` | Bloqueia entrada, alerta |
| **T-12** | Forçar sync como validator | Operação negada |

---

## 11. Cronograma de Implementação

```
Semana 1 (Dias 1–7)
  ├── Dia 1–2:  Setup projeto, banco, migrations, auth
  ├── Dia 3–4:  Importação CSV + endpoint de sync
  ├── Dia 5–6:  Terminal de portaria (validação + offline)
  └── Dia 7:    Busca manual + feedback visual/sonoro

Semana 2 (Dias 8–12)
  ├── Dia 8–9:  Dashboard ADM
  ├── Dia 10:   Testes integrados (todos os T-XX)
  ├── Dia 11:   Deploy produção
  └── Dia 12:   Treinamento da equipe + simulação
```
