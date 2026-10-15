# Guia de Implementação - Validevento

## Visão Geral

Este documento orienta a implementação das melhorias em **6 fases sequenciais**. Cada fase pode ser executada independentemente em uma sessão de trabalho.

---

## Pré-Requisitos

```bash
# Node.js 20+
node --version

# PostgreSQL 16+
psql --version

# Git (para controle de alterações)
git status  # verificar estado atual
```

---

## FASE 1: Correção de Isolamento MASTER/Admin/Supervisor

### Objetivo
Garantir que o usuário MASTER só acesse eventos de um cliente selecionado, eliminando sobreposições de permissões.

### Arquivos a Modificar

| Arquivo | Tipo |
|---------|------|
| `backend/src/middleware/eventAccess.js` | MODIFICAR |
| `backend/src/modules/clients/clients.service.js` | MODIFICAR |
| `backend/src/modules/clients/clients.routes.js` | MODIFICAR |
| `frontend/src/store/scopeStore.js` | MODIFICAR |
| `frontend/src/components/master/TenantSelect.jsx` | MODIFICAR |
| `frontend/src/pages/admin/EventsList.jsx` | MODIFICAR |
| `frontend/src/App.jsx` | MODIFICAR |

### Passo 1.1: Backend - Middleware de Escopo Obrigatório

**Arquivo:** `backend/src/middleware/eventAccess.js`

Adicionar após a função `eventAccess` (após linha 98):

```javascript
/**
 * Variante que requer tenant_id explícito para MASTER.
 * Usado em rotas admin onde o contexto de cliente é obrigatório.
 */
async function eventAccessRequireTenant(req, res, next) {
  try {
    const eventId = req.params.eventId || req.params.id;
    if (!eventId) {
      return res.status(400).json({ error: 'Identificador do evento é obrigatório.' });
    }
    if (!isValidUUIDv4(eventId)) {
      return notFound(res);
    }

    const result = await db.query(
      `SELECT * FROM events WHERE id = $1`,
      [eventId]
    );

    if (result.rowCount === 0) {
      return notFound(res);
    }
    const event = result.rows[0];

    const { role, tenant_id: userTenantId } = req.user;

    // MASTER sem tenant_id selecionado = acesso negado
    if (role === 'master' && !req.forcedTenantId && event.tenant_id !== req.forcedTenantId) {
      return res.status(403).json({
        error: 'tenant_context_required',
        message: 'MASTER deve selecionar um cliente antes de acessar eventos.',
      });
    }

    // Se MASTER com tenant forçado, verificar correspondência
    if (role === 'master' && req.forcedTenantId && event.tenant_id !== req.forcedTenantId) {
      return notFound(res);
    }

    // Demais lógica permanece igual
    if (role === 'master') {
      req.event = event;
      req.eventRole = 'master';
      return next();
    }

    if (event.tenant_id !== userTenantId) {
      return notFound(res);
    }

    if (role === 'admin') {
      req.event = event;
      req.eventRole = 'admin';
      return next();
    }

    const teamResult = await db.query(
      `SELECT role_override FROM event_team
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, req.user.id]
    );

    if (teamResult.rowCount === 0) {
      return forbidden(res);
    }

    const roleOverride = teamResult.rows[0].role_override;

    if (RESTRICTED_ROLES.includes(role) && event.status !== 'active') {
      return res.status(403).json({
        error: 'Este evento não está ativo.',
        event_status: event.status,
      });
    }

    req.event = event;
    req.eventRole = roleOverride || role;
    return next();
  } catch (error) {
    console.error('Falha no eventAccessRequireTenant:', error.message);
    return res.status(500).json({ error: 'Erro ao verificar acesso ao evento.' });
  }
}
```

### Passo 1.2: Backend - Store de Contexto MASTER

**Arquivo:** `backend/src/middleware/eventAccess.js`

Adicionar no final, antes do `module.exports`:

```javascript
/**
 * Extrai forcedTenantId do header X-Tenant-Id (setado pelo frontend após seleção).
 */
function withForcedTenantId(req, res, next) {
  const tenantId = req.headers['x-tenant-id'];
  if (tenantId && isValidUUIDv4(tenantId)) {
    req.forcedTenantId = tenantId;
  }
  next();
}

module.exports = {
  eventAccess,
  requireEventRole,
  eventAccessFromInput,
  eventAccessRequireTenant,
  withForcedTenantId,
};
```

### Passo 1.3: Backend - Rotas com Tenant

**Arquivo:** `backend/src/modules/events/events.routes.js`

Adicionar middleware às rotas admin:

```javascript
const { withForcedTenantId } = require('../../middleware/eventAccess');

// Aplicar em todas as rotas de eventos para MASTER
eventsRouter.use(withForcedTenantId);
```

### Passo 1.4: Frontend - Store de Escopo

**Arquivo:** `frontend/src/store/scopeStore.js`

```javascript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useScopeStore = create(
  persist(
    (set, get) => ({
      // Estado atual
      tenantId: null,
      tenantName: null,
      selectedTenantForMaster: null, // { id, name }

      setTenant: (id, name) => set({ tenantId: id, tenantName: name }),

      setTenantForMaster: (tenant) => {
        if (tenant) {
          set({ selectedTenantForMaster: tenant });
        } else {
          set({ selectedTenantForMaster: null });
        }
      },

      clearTenant: () => set({ tenantId: null, tenantName: null }),

      getActiveTenantId: () => {
        const { user } = useAuthStore.getState();
        if (user?.role === 'master') {
          return get().selectedTenantForMaster?.id || null;
        }
        return get().tenantId;
      },
    }),
    {
      name: 'validevento-scope',
      partialize: (state) => ({
        tenantId: state.tenantId,
        tenantName: state.tenantName,
        selectedTenantForMaster: state.selectedTenantForMaster,
      }),
    }
  )
);

export const useActiveTenantId = () => {
  const { user } = useAuthStore();
  const { tenantId, selectedTenantForMaster } = useScopeStore();

  if (user?.role === 'master') {
    return selectedTenantForMaster?.id || null;
  }
  return tenantId;
};
```

### Passo 1.5: Frontend - Interceptor de API

**Arquivo:** `frontend/src/services/api.js`

Adicionar interceptor para enviar `X-Tenant-Id`:

```javascript
api.interceptors.request.use((config) => {
  const { selectedTenantForMaster } = useScopeStore.getState();
  if (selectedTenantForMaster?.id) {
    config.headers['X-Tenant-Id'] = selectedTenantForMaster.id;
  }
  return config;
});
```

### Passo 1.6: Frontend - Componente de Proteção

**Arquivo:** `frontend/src/components/master/MasterTenantGate.jsx` (CRIAR)

```javascript
import { useAuthStore } from '../../store/authStore';
import { useScopeStore } from '../../store/scopeStore';
import TenantSelect from './TenantSelect';

export function MasterTenantGate({ children }) {
  const { user } = useAuthStore();
  const { selectedTenantForMaster } = useScopeStore();

  if (user?.role === 'master' && !selectedTenantForMaster) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="card card-pad max-w-md w-full">
          <h1 className="card-title mb-4">Selecione um Cliente</h1>
          <p className="text-muted mb-6">
            Como usuário MASTER, você precisa selecionar um cliente para acessar
            a área administrativa.
          </p>
          <TenantSelect
            onSelect={(tenant) => {
              useScopeStore.getState().setTenantForMaster(tenant);
            }}
            required
          />
        </div>
      </div>
    );
  }

  return children;
}
```

### Passo 1.7: Frontend - Proteger Rotas

**Arquivo:** `frontend/src/App.jsx`

```javascript
import { MasterTenantGate } from './components/master/MasterTenantGate';

// Em rotas admin:
<Route path="/admin/eventos" element={
  <MasterTenantGate>
    <PrivateRoute allowedRoles={['admin', 'master']}><EventsList /></PrivateRoute>
  </MasterTenantGate>
} />

// Adicionar em todas as rotas /admin/*
```

### Passo 1.8: Frontend - EventsList com Validação

**Arquivo:** `frontend/src/pages/admin/EventsList.jsx`

Adicionar no início do componente:

```javascript
import { useAuthStore } from '../../store/authStore';
import { useScopeStore } from '../../store/scopeStore';

export default function EventsList() {
  const { user } = useAuthStore();
  const { selectedTenantForMaster } = useScopeStore();
  // ...

  // MASTER sem tenant não pode ver lista de eventos
  if (user?.role === 'master' && !selectedTenantForMaster) {
    return (
      <div className="page">
        <TopBar crumb="Eventos" />
        <div className="page-body">
          <div className="card card-pad text-center">
            <p className="text-muted">
              Selecione um cliente no menu lateral para gerenciar seus eventos.
            </p>
          </div>
        </div>
      </div>
    );
  }
  // ...
}
```

### ✅ Testes - FASE 1

Após implementar, execute os testes abaixo:

```bash
# 1. Iniciar servidores
cd backend && npm run dev &
cd frontend && npm run dev &

# 2. Login como MASTER
# - Acesse http://localhost:5173/login
# - Faça login com conta MASTER
# - Verifique se aparece tela de seleção de cliente ANTES de permitir acesso a /admin/eventos
```

**Checklist de Testes - FASE 1:**

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| 1 | MASTER sem cliente selecionado acessa `/admin/eventos` | Redirecionado para seleção de cliente |
| 2 | MASTER seleciona Cliente A, acessa `/admin/eventos` | Lista apenas eventos do Cliente A |
| 3 | MASTER tenta acessar evento de Cliente B | Erro 403 ou não encontrado |
| 4 | ADMIN acessa `/admin/eventos` | Lista eventos do seu cliente normalmente |
| 5 | SUPERVISOR acessa evento que está na equipe | Acesso permitido |
| 6 | SUPERVISOR acessa evento que NÃO está na equipe | Erro 403 |
| 7 | MASTER muda cliente selecionado | Lista de eventos atualiza para novo cliente |
| 8 | Refresh na página mantém cliente selecionado | Persistido em localStorage |

---

## FASE 2: Suporte a 10+ Terminais Genéricos Simultâneos

### Objetivo
Garantir que 10+ terminais genéricos possam operar simultaneamente sem conflitos de conexão.

### Arquivos a Modificar

| Arquivo | Tipo |
|---------|------|
| `backend/migrations/012_terminal_sessions.sql` | CRIAR |
| `backend/src/modules/terminals/terminals.service.js` | MODIFICAR |
| `backend/src/modules/terminals/terminals.controller.js` | MODIFICAR |
| `frontend/src/services/syncService.js` | MODIFICAR |
| `frontend/src/pages/terminal/JoinTerminal.jsx` | MODIFICAR |

### Passo 2.1: Migration

**Arquivo:** `backend/migrations/012_terminal_sessions.sql`

```sql
-- Suporte a terminais suspensos e soft-delete

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS session_token UUID DEFAULT gen_random_uuid();

COMMENT ON TABLE terminals IS 'Terminais de validação (generic=sem login)';
COMMENT ON COLUMN terminals.suspended IS 'Terminal temporariamente bloqueado (pode reativar)';
COMMENT ON COLUMN terminals.deleted_at IS 'Soft-delete: dados preservados mas terminal inacessível';
```

Executar:
```bash
cd backend && psql $DATABASE_URL -f migrations/012_terminal_sessions.sql
```

### Passo 2.2: Backend - Lógica Idempotente

**Arquivo:** `backend/src/modules/terminals/terminals.service.js`

Modificar `findGenericBySlug` (linha 54) e adicionar novas funções:

```javascript
// Modificar findGenericBySlug para incluir campos de status
async function findGenericBySlug(slug) {
  const normalized = String(slug || '').trim().toUpperCase();
  if (!SLUG_RE.test(normalized)) return null;

  const result = await db.query(
    `SELECT t.id, t.name, t.event_id, t.online, t.operator_name,
            t.suspended, t.suspended_at, t.deleted_at,
            e.name AS event_name, e.status AS event_status,
            e.date AS event_date, e.location, e.logo_url, e.tenant_id
     FROM terminals t
     JOIN events e ON e.id = t.event_id
     WHERE t.slug = $1 AND t.is_generic = true`,
    [normalized]
  );

  return result.rows[0] || null;
}

// Nova função: abrir terminal com idempotência
async function openOrGetTerminal(slug, operatorName) {
  const terminal = await findGenericBySlug(slug);

  if (!terminal) return { error: 'terminal_not_found' };
  if (terminal.deleted_at) return { error: 'terminal_deleted' };
  if (terminal.suspended) return { error: 'terminal_suspended' };

  // UPSERT idempotente
  const result = await db.query(
    `INSERT INTO terminals (event_id, name, slug, is_generic, operator_name, online, last_seen_at)
     VALUES ($1, $2, $3, true, $4, true, NOW())
     ON CONFLICT (slug) DO UPDATE
       SET online = true,
           last_seen_at = NOW(),
           operator_name = COALESCE($4, terminals.operator_name)
     RETURNING *`,
    [terminal.event_id, terminal.name, slug, operatorName]
  );

  return {
    ...result.rows[0],
    event_name: terminal.event_name,
    event_config: await getEventConfig(terminal.event_id),
  };
}

// Nova função: suspender/reativar terminal
async function setSuspended(terminalId, suspended, userId) {
  const result = await db.query(
    `UPDATE terminals
     SET suspended = $2,
         suspended_at = CASE WHEN $2 = true THEN NOW() ELSE NULL END,
         suspended_by = CASE WHEN $2 = true THEN $3 ELSE NULL END
     WHERE id = $1
     RETURNING *`,
    [terminalId, suspended, userId]
  );
  return result.rows[0];
}

// Nova função: soft-delete
async function softDelete(terminalId) {
  await db.query(
    `UPDATE terminals
     SET deleted_at = NOW(), online = false
     WHERE id = $1`,
    [terminalId]
  );
}
```

### Passo 2.3: Backend - Controller Atualizado

**Arquivo:** `backend/src/modules/terminals/terminals.controller.js`

Modificar função `open` para usar `openOrGetTerminal`:

```javascript
async function open(req, res) {
  try {
    const { slug } = req.params;
    const { operator_name } = req.body;

    const result = await terminalsService.openOrGetTerminal(slug, operator_name);

    if (result.error) {
      const statusMap = {
        terminal_not_found: 404,
        terminal_deleted: 410,
        terminal_suspended: 403,
      };
      return res.status(statusMap[result.error] || 400).json({
        error: result.error,
        details: `Terminal não disponível: ${result.error}`,
      });
    }

    // Salvar contexto local
    await saveMeta('terminal_id', result.id);
    await saveMeta('terminal_name', result.name);
    await saveMeta('event_name', result.event_name);
    await saveMeta('event_config', result.event_config);

    return res.json({
      terminal_id: result.id,
      terminal_name: result.name,
      event_id: result.event_id,
      event_name: result.event_name,
      event_config: result.event_config,
    });
  } catch (error) {
    console.error('Erro ao abrir terminal:', error);
    return res.status(500).json({ error: 'internal_error' });
  }
}

// NOVA função: suspender
async function suspend(req, res) {
  try {
    const { terminalId } = req.params;
    const { suspended } = req.body;

    const result = await terminalsService.setSuspended(
      terminalId,
      suspended !== false,
      req.user.id
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// NOVA função: deletar
async function remove(req, res) {
  try {
    const { terminalId } = req.params;
    await terminalsService.softDelete(terminalId);
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

### Passo 2.4: Backend - Rotas

**Arquivo:** `backend/src/modules/terminals/terminals.routes.js`

```javascript
// Rotas autenticadas (em eventsRouter):
eventsRouter.patch(
  '/:eventId/terminals/:terminalId/suspend',
  requireRole('admin', 'master'),
  eventAccess,
  terminalsController.suspend
);

eventsRouter.delete(
  '/:eventId/terminals/:terminalId',
  requireRole('admin', 'master'),
  eventAccess,
  terminalsController.remove
);
```

### Passo 2.5: Frontend - Sync Interval

**Arquivo:** `frontend/src/services/syncService.js`

```javascript
// Linha 17: alterar de 60 min para 30 seg
const SYNC_INTERVAL_MS = 30_000; // 30 segundos
```

### Passo 2.6: Frontend - JoinTerminal com Retry

**Arquivo:** `frontend/src/pages/terminal/JoinTerminal.jsx`

```javascript
// Adicionar função de retry
async function handleEnterWithRetry(maxAttempts = 3) {
  setEntering(true);
  setError('');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await api.post(`/api/terminal/join/${slug}/open`, {
        operator_name: operatorName.trim() || null,
      });

      await setTerminalId(data.terminal_id);
      await setEventId(data.event_id);
      await saveMeta('event_config', data.event_config);
      await saveMeta('terminal_name', data.terminal_name);
      await saveMeta('event_name', data.event_name);

      setGeneric({ slug });
      await setEvent({ eventId: data.event_id });
      await setTerminal({ terminalId: data.terminal_id, terminalName: data.terminal_name });

      navigate(`/terminal/join/${slug}/app`, { replace: true });
      return;
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  setError(lastError?.response?.data?.details || 'Não foi possível entrar no terminal.');
  setEntering(false);
}
```

### ✅ Testes - FASE 2

```bash
# Aplicar migration primeiro
cd backend && psql $DATABASE_URL -f migrations/012_terminal_sessions.sql
```

**Checklist de Testes - FASE 2:**

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| 1 | Criar terminal genérico via API | Terminal criado com slug único |
| 2 | Abrir mesmo terminal de 2 abas simultaneamente | Ambos recebem terminal_id válido |
| 3 | Abrir terminal suspenso | Erro 403 "terminal_suspended" |
| 4 | Abrir terminal deletado | Erro 410 "terminal_deleted" |
| 5 | Abrir 10 terminais simultâneos (mesmo evento) | Todos abrem com retry logic |
| 6 | Sync interval está em 30 segundos | Verificar em syncService.js |
| 7 | Terminal fica offline por 1min | Status muda para offline no dashboard |
| 8 | Suspender terminal pelo admin | Terminal mostra "Acesso suspenso" no join |
| 9 | Reativar terminal suspenso | Terminal volta a funcionar normalmente |
| 10 | Deletar terminal | Soft-delete, dados preservados |

**Teste de Carga (10 terminais):**
```bash
# Abrir 10 terminais simultâneos com curl:
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/terminal/join/SLUG1/open \
    -H "Content-Type: application/json" \
    -d '{"operator_name":"Operador'$i'"}' &
done
wait
# Verificar se todos os 10 terminais aparecem no dashboard
```

---

## FASE 3: Gerador de QR Code para Terminais

### Objetivo
Permitir que administradores gerem QR codes para cada terminal genérico.

### Arquivos a Modificar/Criar

| Arquivo | Tipo |
|---------|------|
| `backend/package.json` | MODIFICAR |
| `backend/src/modules/terminals/terminals.service.js` | MODIFICAR |
| `backend/src/modules/terminals/terminals.controller.js` | MODIFICAR |
| `backend/src/modules/terminals/terminals.routes.js` | MODIFICAR |
| `frontend/src/pages/admin/TerminalManager.jsx` | CRIAR |
| `frontend/src/components/admin/TerminalQRModal.jsx` | CRIAR |
| `frontend/src/App.jsx` | MODIFICAR |

### Passo 3.1: Instalar Dependência

```bash
cd backend && npm install qrcode && npm install --save-dev @types/qrcode
```

### Passo 3.2: Backend - Serviço de QR

**Arquivo:** `backend/src/modules/terminals/terminals.service.js`

```javascript
const QRCode = require('qrcode');

async function generateQRCode(slug) {
  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://validevento.com.br';
  const url = `${baseUrl}/terminal/join/${slug}`;

  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
    return { url, qrcode: dataUrl };
  } catch (err) {
    throw new Error('qr_generation_failed');
  }
}

async function generateQRBuffer(slug) {
  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://validevento.com.br';
  const url = `${baseUrl}/terminal/join/${slug}`;

  return QRCode.toBuffer(url, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}

module.exports = {
  // ... existing exports
  generateQRCode,
  generateQRBuffer,
};
```

### Passo 3.3: Backend - Controller

**Arquivo:** `backend/src/modules/terminals/terminals.controller.js`

```javascript
async function getQRCode(req, res) {
  try {
    const { slug } = req.params;
    const { format } = req.query;

    const result = await terminalsService.generateQRCode(slug);

    if (format === 'png') {
      const buffer = await terminalsService.generateQRBuffer(slug);
      res.setHeader('Content-Type', 'image/png');
      return res.send(buffer);
    }

    res.json(result);
  } catch (err) {
    if (err.message === 'terminal_not_found') {
      return res.status(404).json({ error: 'terminal_not_found' });
    }
    res.status(500).json({ error: 'qr_generation_failed' });
  }
}

module.exports = {
  // ... existing exports
  getQRCode,
};
```

### Passo 3.4: Backend - Rota Pública

**Arquivo:** `backend/src/modules/terminals/terminals.routes.js`

```javascript
// Em publicRouter:
publicRouter.get('/:slug/qr', bySlug, terminalsController.getQRCode);
```

### Passo 3.5: Frontend - Modal de QR

**Arquivo:** `frontend/src/components/admin/TerminalQRModal.jsx`

```javascript
import { useState, useEffect } from 'react';
import { Modal } from '../ui';
import api from '../../services/api';
import { toast } from 'sonner';

export function TerminalQRModal({ terminal, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!terminal?.slug) return;

    api.get(`/api/terminal/${terminal.slug}/qr`)
      .then(({ data }) => setQrDataUrl(data.qrcode))
      .catch(() => toast.error('Erro ao gerar QR code'))
      .finally(() => setLoading(false));
  }, [terminal?.slug]);

  function handleDownload() {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `terminal-${terminal.slug}.png`;
    link.href = qrDataUrl;
    link.click();
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/terminal/join/${terminal.slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  }

  const baseUrl = window.location.origin;

  return (
    <Modal open onClose={onClose} title={`QR Code - ${terminal?.name}`}>
      {loading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="text-center">
          <img
            src={qrDataUrl}
            alt="QR Code do Terminal"
            className="mx-auto rounded-lg"
            style={{ width: 280, height: 280 }}
          />
          <p className="text-sm text-muted mt-4 break-all px-4">
            {baseUrl}/terminal/join/{terminal?.slug}
          </p>
          <div className="flex gap-3 justify-center mt-6">
            <button className="btn btn-primary" onClick={handleDownload}>
              Baixar PNG
            </button>
            <button className="btn btn-outline" onClick={handleCopyLink}>
              Copiar Link
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

### Passo 3.6: Frontend - Página de Gerenciamento

**Arquivo:** `frontend/src/pages/admin/TerminalManager.jsx`

```javascript
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import TopBar from '../../components/TopBar';
import { Modal, Btn } from '../../components/ui';
import { TerminalQRModal } from '../../components/admin/TerminalQRModal';
import api from '../../services/api';
import { toast } from 'sonner';
import { relativeTime } from '../../lib/format';

export default function TerminalManager() {
  const { id: eventId } = useParams();
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadTerminals = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/events/${eventId}/terminals`);
      setTerminals(data);
    } catch (err) {
      toast.error('Erro ao carregar terminais');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { loadTerminals(); }, [loadTerminals]);

  async function handleCopyLink(slug) {
    const url = `${window.location.origin}/terminal/join/${slug}`;
    await navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  }

  async function handleSuspend(terminal) {
    setActionLoading(true);
    try {
      await api.patch(`/api/events/${eventId}/terminals/${terminal.id}/suspend`, {
        suspended: !terminal.suspended,
      });
      toast.success(terminal.suspended ? 'Terminal reativado' : 'Terminal suspenso');
      setSuspendTarget(null);
      loadTerminals();
    } catch {
      toast.error('Erro ao atualizar terminal');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(terminal) {
    setActionLoading(true);
    try {
      await api.delete(`/api/events/${eventId}/terminals/${terminal.id}`);
      toast.success('Terminal removido');
      setDeleteTarget(null);
      loadTerminals();
    } catch {
      toast.error('Erro ao remover terminal');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="page">
      <TopBar
        crumb="Terminais"
        eventName={terminals[0]?.event_name}
        onBack={() => window.history.back()}
      />
      <div className="page-body">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-semibold">Terminais Genéricos</h1>
          <Link
            to={`/admin/eventos/${eventId}`}
            className="btn btn-outline btn-sm"
          >
            ← Voltar ao evento
          </Link>
        </div>

        <div className="card">
          {loading ? (
            <div className="p-8 text-center text-muted">Carregando...</div>
          ) : terminals.length === 0 ? (
            <div className="p-8 text-center text-muted">
              Nenhum terminal genérico criado para este evento.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Slug</th>
                    <th>Status</th>
                    <th>Validações hoje</th>
                    <th>Último acesso</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {terminals.map((t) => (
                    <tr key={t.id} className={t.suspended ? 'opacity-50' : ''}>
                      <td className="font-medium">{t.name}</td>
                      <td className="mono text-sm">{t.slug}</td>
                      <td>
                        <span className={`badge ${
                          t.suspended ? 'badge-red' :
                          t.online ? 'badge-green' : 'badge-gray'
                        }`}>
                          {t.suspended ? 'Suspenso' : t.online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td>{t.validations_today ?? 0}</td>
                      <td className="text-sm text-muted">
                        {t.last_seen_at ? relativeTime(t.last_seen_at) : '—'}
                      </td>
                      <td>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => { setSelectedTerminal(t); setShowQR(true); }}
                          >
                            QR
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleCopyLink(t.slug)}
                          >
                            Copiar
                          </button>
                          <button
                            className={`btn btn-sm ${t.suspended ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setSuspendTarget(t)}
                          >
                            {t.suspended ? 'Reativar' : 'Suspender'}
                          </button>
                          <button
                            className="btn btn-sm btn-ghost text-danger"
                            onClick={() => setDeleteTarget(t)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showQR && selectedTerminal && (
        <TerminalQRModal
          terminal={selectedTerminal}
          onClose={() => { setShowQR(false); setSelectedTerminal(null); }}
        />
      )}

      {suspendTarget && (
        <Modal
          open
          onClose={() => setSuspendTarget(null)}
          title={suspendTarget.suspended ? 'Reativar Terminal' : 'Suspender Terminal'}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setSuspendTarget(null)}>
                Cancelar
              </Btn>
              <Btn
                variant={suspendTarget.suspended ? 'primary' : 'danger'}
                loading={actionLoading}
                onClick={() => handleSuspend(suspendTarget)}
              >
                Confirmar
              </Btn>
            </>
          }
        >
          <p className="text-sm">
            {suspendTarget.suspended
              ? `Deseja reativar o terminal "${suspendTarget.name}"? Ele voltará a aceitar conexões.`
              : `Deseja suspender o terminal "${suspendTarget.name}"? Ele não poderá mais ser usado.`}
          </p>
          <p className="text-sm text-muted mt-2">
            Os dados gerados por este terminal serão preservados.
          </p>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          open
          onClose={() => setDeleteTarget(null)}
          title="Excluir Terminal"
          footer={
            <>
              <Btn variant="ghost" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Btn>
              <Btn variant="danger" loading={actionLoading} onClick={() => handleDelete(deleteTarget)}>
                Excluir
              </Btn>
            </>
          }
        >
          <p className="text-sm">
            Deseja excluir o terminal "{deleteTarget.name}"?
          </p>
          <p className="text-sm text-muted mt-2">
            Esta ação é reversível. Os dados de validação serão mantidos.
          </p>
        </Modal>
      )}
    </div>
  );
}
```

### Passo 3.7: Frontend - Adicionar Rota

**Arquivo:** `frontend/src/App.jsx`

```javascript
import TerminalManager from './pages/admin/TerminalManager';

// Em rotas admin:
<Route
  path="/admin/eventos/:id/terminais"
  element={
    <MasterTenantGate>
      <PrivateRoute allowedRoles={['admin', 'master']}>
        <TerminalManager />
      </PrivateRoute>
    </MasterTenantGate>
  }
/>
```

### Passo 3.8: Frontend - Link no EventDetail

**Arquivo:** `frontend/src/pages/admin/EventDetail.jsx`

Adicionar botão de terminais:

```javascript
{event?.status === 'active' && (
  <Link
    to={`/admin/eventos/${event.id}/terminais`}
    className="btn btn-outline btn-sm"
  >
    Terminais
  </Link>
)}
```

### ✅ Testes - FASE 3

```bash
# Instalar dependência primeiro
cd backend && npm install qrcode
```

**Checklist de Testes - FASE 3:**

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| 1 | GET `/api/terminal/ABCD12/qr` retorna JSON com `qrcode` | Base64 data URL |
| 2 | GET `/api/terminal/ABCD12/qr?format=png` retorna PNG | Content-Type: image/png |
| 3 | QR code escaneável aponta para URL correta | Link `/terminal/join/ABCD12` |
| 4 | Botão "QR" na página TerminalManager abre modal | Modal com QR code |
| 5 | Botão "Baixar PNG" faz download | Arquivo `terminal-ABCD12.png` |
| 6 | Botão "Copiar Link" copia URL | Link na clipboard |
| 7 | QR code contém evento_id correto | Escaneando abre terminal correto |
| 8 | TerminalManager lista terminais do evento | Tabela com nome, slug, status |
| 9 | Link para `/admin/eventos/:id/terminais` funciona | Página de gerenciamento carrega |
| 10 | EventDetail tem botão "Terminais" | Navega para TerminalManager |

**Teste Manual do QR:**
```bash
# Gerar QR e salvar
curl http://localhost:3000/api/terminal/SLUG1/qr?format=png -o test-qr.png

# Verificar se é uma imagem PNG válida
file test-qr.png  # deve mostrar: PNG image data

# Abrir em visualizador
xdg-open test-qr.png  # ou open no macOS
```

---

## FASE 4: Dashboard de Métricas por Terminal

### Objetivo
Fornecer métricas detalhadas por terminal: validações, velocidade, operador.

### Arquivos a Modificar

| Arquivo | Tipo |
|---------|------|
| `backend/src/modules/dashboard/dashboard.service.js` | MODIFICAR |
| `backend/src/modules/dashboard/dashboard.controller.js` | MODIFICAR |
| `backend/src/modules/dashboard/dashboard.routes.js` | MODIFICAR |
| `frontend/src/components/dashboard/TerminalMetricsPanel.jsx` | CRIAR |
| `frontend/src/pages/supervisor/EventDashboard.jsx` | MODIFICAR |

### Passo 4.1: Backend - Métricas Detalhadas

**Arquivo:** `backend/src/modules/dashboard/dashboard.service.js`

Adicionar função:

```javascript
async function getTerminalDetailedMetrics(eventId, tenantId) {
  const result = await db.query(
    `SELECT
        t.id,
        t.name,
        t.online,
        t.last_seen_at,
        t.operator_name,
        t.suspended,
        COUNT(el.id)::integer AS total_validations,
        COUNT(el.id) FILTER (
          WHERE el.created_at >= CURRENT_DATE
        )::integer AS validations_today,
        AVG(
          EXTRACT(EPOCH FROM (
            el.created_at - lag(el.created_at) OVER (
              PARTITION BY el.terminal_id ORDER BY el.created_at
            )
          ))
        ) FILTER (
          WHERE lag(el.created_at) IS NOT NULL
            AND el.created_at >= CURRENT_DATE
        ) AS avg_gap_seconds,
        MIN(el.created_at) FILTER (
          WHERE el.created_at >= CURRENT_DATE
        ) AS first_validation_today,
        MAX(el.created_at) FILTER (
          WHERE el.created_at >= CURRENT_DATE
        ) AS last_validation_today
     FROM terminals t
     LEFT JOIN entry_logs el ON el.terminal_id = t.id
     WHERE t.event_id = $1
       AND t.deleted_at IS NULL
     GROUP BY t.id
     ORDER BY t.name ASC`,
    [eventId]
  );

  return result.rows.map(r => ({
    id: r.id,
    name: r.name,
    online: r.online,
    suspended: r.suspended,
    last_seen_at: r.last_seen_at,
    operator_name: r.operator_name,
    total_validations: Number(r.total_validations),
    validations_today: Number(r.validations_today),
    avg_gap_seconds: r.avg_gap_seconds
      ? Math.round(Number(r.avg_gap_seconds))
      : null,
    first_validation_today: r.first_validation_today,
    last_validation_today: r.last_validation_today,
  }));
}
```

### Passo 4.2: Backend - Controller

**Arquivo:** `backend/src/modules/dashboard/dashboard.controller.js`

```javascript
async function terminalDetailedMetrics(req, res) {
  try {
    const { eventId } = req.params;
    const { tenant_id } = req.query;

    const tenantId = tenant_id || (req.user?.tenant_id);

    const metrics = await dashboardService.getTerminalDetailedMetrics(eventId, tenantId);
    res.json(metrics);
  } catch (error) {
    console.error('Erro em terminalDetailedMetrics:', error);
    res.status(500).json({ error: 'internal_error' });
  }
}
```

### Passo 4.3: Backend - Rota

**Arquivo:** `backend/src/modules/dashboard/dashboard.routes.js`

```javascript
dashboardRouter.get(
  '/:eventId/terminals/detailed',
  authMiddleware,
  requireRole('admin', 'supervisor', 'master'),
  eventAccess,
  dashboardController.terminalDetailedMetrics
);
```

### Passo 4.4: Frontend - Painel de Métricas

**Arquivo:** `frontend/src/components/dashboard/TerminalMetricsPanel.jsx`

```javascript
import { relativeTime } from '../../lib/format';

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TerminalMetricsPanel({ data, loading }) {
  if (loading) {
    return <div className="card card-pad">Carregando métricas...</div>;
  }

  const terminals = data || [];

  return (
    <div className="card card-pad">
      <div className="card-head">
        <h3 className="card-title">Terminais - Métricas Detalhadas</h3>
      </div>

      {terminals.length === 0 && (
        <p className="text-muted text-sm text-center py-4">
          Nenhum terminal registrado
        </p>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Terminal</th>
              <th>Status</th>
              <th>Validações hoje</th>
              <th>Velocidade média</th>
              <th>Primeira</th>
              <th>Última</th>
              <th>Operador</th>
            </tr>
          </thead>
          <tbody>
            {terminals.map((t) => (
              <tr key={t.id} className={t.suspended ? 'opacity-50' : ''}>
                <td className="font-medium">{t.name}</td>
                <td>
                  <span className={`badge ${
                    t.suspended ? 'badge-red' :
                    t.online ? 'badge-green' : 'badge-gray'
                  }`}>
                    {t.suspended ? 'Suspenso' : t.online ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td className="text-center">{t.validations_today ?? 0}</td>
                <td>
                  {t.avg_gap_seconds != null
                    ? `${t.avg_gap_seconds}s`
                    : '—'}
                </td>
                <td className="text-sm">{formatTime(t.first_validation_today)}</td>
                <td className="text-sm">{formatTime(t.last_validation_today)}</td>
                <td className="text-sm text-muted">{t.operator_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Passo 4.5: Frontend - Integrar no Dashboard

**Arquivo:** `frontend/src/pages/supervisor/EventDashboard.jsx`

```javascript
import { TerminalMetricsPanel } from '../../components/dashboard/TerminalMetricsPanel';

// Adicionar na seção de terminais, antes de TerminalsStatus:
{(user?.role === 'admin' || user?.role === 'master') && isActive && (
  <div className="mt-4">
    <TerminalMetricsPanel
      data={dash.data?.terminalsDetailed}
      loading={dash.loading}
    />
  </div>
)}
```

### Passo 4.6: Hook de Dashboard

**Arquivo:** `frontend/src/hooks/useDashboardData.js`

Adicionar na query de dashboard:

```javascript
const { data, ... } = useDashboardData(eventId);

useEffect(() => {
  if (!eventId) return;

  api.get(`/api/events/${eventId}/dashboard/terminals/detailed`).then(({ data }) => {
    setDashboardData(prev => ({ ...prev, terminalsDetailed: data }));
  });
}, [eventId]);
```

### ✅ Testes - FASE 4

**Checklist de Testes - FASE 4:**

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| 1 | GET `/api/events/:id/dashboard/terminals/detailed` | Retorna array de terminais com métricas |
| 2 | Painel TerminalMetricsPanel aparece no dashboard | Para admin/master |
| 3 | Coluna "Velocidade média" mostra segundos | Ex: "3s" |
| 4 | Coluna "Primeira" mostra hora da 1ª validação | HH:MM |
| 5 | Coluna "Última" mostra hora da última validação | HH:MM |
| 6 | Coluna "Operador" mostra nome ou "—" | Valor correto |
| 7 | Terminal suspenso aparece com opacidade 50% | Visual diferenciado |
| 8 | Terminal online/offline com badge colorido | Verde=online, cinza=offline |
| 9 | Painel NÃO aparece para supervisor | Apenas admin/master veem |
| 10 | Dashboard auto-refresh atualiza métricas | A cada 30 segundos |

**Teste de Métricas:**
```bash
# Fazer validações e verificar métricas
# 1. Fazer 5 validações no terminal
# 2. Aguardar sync (30s)
# 3. Verificar no dashboard:
#    - validations_today = 5
#    - avg_gap_seconds = tempo médio entre validações
```

---

## FASE 5: Suporte a Scanner USB (HID Keyboard Emulation)

### Objetivo
Permitir que scanners de código de barras USB (leitores HID) funcionem no terminal de validação.

### Arquivos a Criar

| Arquivo | Tipo |
|---------|------|
| `frontend/src/hooks/useExternalScanner.js` | CRIAR |
| `frontend/src/components/ScannerInput.jsx` | CRIAR |
| `frontend/src/components/ScannerSettings.jsx` | CRIAR |
| `frontend/src/pages/terminal/Terminal.jsx` | MODIFICAR |

### Passo 5.1: Hook de Detecção

**Arquivo:** `frontend/src/hooks/useExternalScanner.js`

```javascript
import { useEffect, useRef, useCallback, useState } from 'react';

const SCAN_TIMEOUT_MS = 100;
const MIN_SCAN_LENGTH = 8;
const TYPING_SPEED_THRESHOLD = 50;

export function useExternalScanner({ onScan, enabled = true }) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const timeoutRef = useRef(null);
  const [inputMode, setInputMode] = useState('auto');
  const [isScannerInput, setIsScannerInput] = useState(false);

  const processBuffer = useCallback(() => {
    const scanned = bufferRef.current.trim();
    if (scanned.length >= MIN_SCAN_LENGTH && isScannerInput) {
      onScan(scanned);
    }
    bufferRef.current = '';
    setIsScannerInput(false);
  }, [onScan, isScannerInput]);

  const handleKeyDown = useCallback((e) => {
    if (!enabled) return;

    const now = Date.now();
    const timeDiff = now - lastKeyTimeRef.current;

    if (timeDiff > SCAN_TIMEOUT_MS && bufferRef.current.length > 0) {
      bufferRef.current = '';
    }

    lastKeyTimeRef.current = now;

    if (e.key === 'Enter') {
      e.preventDefault();

      const charCount = bufferRef.current.length;
      const timeElapsed = now - (lastKeyTimeRef.current - timeDiff);

      if (charCount >= MIN_SCAN_LENGTH) {
        const charsPerSecond = timeElapsed > 0
          ? (charCount / timeElapsed) * 1000
          : 0;

        if (charsPerSecond > TYPING_SPEED_THRESHOLD) {
          setIsScannerInput(true);
        }
      }

      processBuffer();
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      bufferRef.current += e.key;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        bufferRef.current = '';
        setIsScannerInput(false);
      }, SCAN_TIMEOUT_MS * 3);
    }
  }, [enabled, processBuffer]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, handleKeyDown]);

  return {
    inputMode,
    isScannerInput,
    setInputMode,
  };
}
```

### Passo 5.2: Scanner Input

**Arquivo:** `frontend/src/components/ScannerInput.jsx`

```javascript
import { useEffect, useRef } from 'react';

export function ScannerInput({ onScan, active = true }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (active) {
      inputRef.current?.focus();
    }
  }, [active]);

  if (!active) return null;

  return (
    <input
      ref={inputRef}
      type="text"
      className="scanner-usb-input"
      aria-label="Scanner de código de barras USB"
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck="false"
    />
  );
}
```

Adicionar CSS em `frontend/src/index.css`:

```css
.scanner-usb-input {
  position: fixed;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  z-index: -1;
}
```

### Passo 5.3: Settings

**Arquivo:** `frontend/src/components/ScannerSettings.jsx`

```javascript
export function ScannerSettings({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted">Fonte:</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="select select-xs"
        style={{ minWidth: 120 }}
      >
        <option value="auto">Auto-detectar</option>
        <option value="camera">Apenas câmera</option>
        <option value="usb">Scanner USB</option>
      </select>
    </div>
  );
}
```

### Passo 5.4: Terminal com Suporte Scanner

**Arquivo:** `frontend/src/pages/terminal/Terminal.jsx`

Adicionar imports:

```javascript
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerSettings } from '../../components/ScannerSettings';
import { useExternalScanner } from '../../hooks/useExternalScanner';
```

Adicionar estado:

```javascript
const [scannerSource, setScannerSource] = useState('auto');
const { isScannerInput } = useExternalScanner({
  onScan: handleScan,
  enabled: scannerSource !== 'camera' && scanReady,
});
```

Modificar handleScan para ignorar quando não é scanner:

```javascript
const handleScan = useCallback(async (text) => {
  if (!text || lockRef.current || !scanReady) return;

  // Se modo USB only, ignorar câmera
  if (scannerSource === 'usb' && !isScannerInput) return;
  // Se modo câmera, ignorar USB
  if (scannerSource === 'camera' && isScannerInput) return;

  lockRef.current = true;
  try {
    const res = mode === 'checkout' && config.checkout_enabled
      ? await checkoutTicket(text)
      : await validateTicket(text);
    setLastResult(res);
    setResult(res);
  } finally {
    setTimeout(() => { lockRef.current = false }, 2200);
  }
}, [mode, config.checkout_enabled, scanReady, scannerSource, isScannerInput, checkoutTicket, validateTicket, setLastResult]);
```

Adicionar no JSX (no footer, antes do botão de busca):

```javascript
<ScannerSettings value={scannerSource} onChange={setScannerSource} />
<ScannerInput onScan={handleScan} active={scannerSource !== 'camera'} />
```

### ✅ Testes - FASE 5

**Checklist de Testes - FASE 5:**

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| 1 | Scanner dropdown aparece no footer do terminal | "Fonte: Auto-detectar / Câmera / USB" |
| 2 | Modo "Câmera" desativa ScannerInput | Apenas QR via câmera |
| 3 | Modo "USB" desativa QRScanner | Apenas scanner de teclado |
| 4 | Modo "Auto-detectar" aceita ambos | Funciona câmera E USB |
| 5 | Scanner USB digita código e Enter | Validação dispara |
| 6 | Digitação humana NÃO dispara scanner | Velocidade < 50chars/s |
| 7 | Scanner Honeywell funciona | Lê código + Enter = validação |
| 8 | Scanner Zebra funciona | Lê código + Enter = validação |
| 9 | Câmera QR continua funcionando | Scanear QR code = validação |
| 10 | Após 3s sem input, buffer limpa | Não há doubles |

**Teste de Scanner USB:**
```bash
# Simular scanner USB (digita rápido + Enter)
# Em modo USB, digitar: 550e8400-e29b-41d4-a716-446655440000
# followed by Enter key
# Deve validar ticket
```

---

## FASE 6: Testes Finais de Integração

### ✅ Testes - FASE 6 (Testes Completos do Sistema)

Execute todos os testes abaixo após implementar todas as fases.

---

### Testes de Isolamento

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| 1 | MASTER acessa sem selecionar cliente | Bloqueado, pede seleção |
| 2 | MASTER ve eventos apenas do cliente selecionado | Isolamento correto |
| 3 | ADMIN ve apenas eventos do seu tenant | Isolamento correto |
| 4 | SUPERVISOR ve apenas eventos da equipe | Isolamento correto |

### Testes de Terminal Genérico

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| 5 | Criar 10 terminais genéricos | Slugs únicos gerados |
| 6 | Abrir 10 simultaneamente | Todos conectam |
| 7 | QR code de cada terminal funciona | Links únicos |
| 8 | Suspender terminal X não afeta Y | Isolamento correto |
| 9 | Deletar terminal mantém dados | entry_logs preservados |
| 10 | Métricas de cada terminal separadas | Dashboard mostra individual |

### Testes de Validação

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| 11 | QR code via câmera smartphone | Validação OK |
| 12 | QR code via câmera tablet | Validação OK |
| 13 | QR code via câmera iPhone | Validação OK |
| 14 | QR code via câmera iPad | Validação OK |
| 15 | Scanner USB Honeywell (Windows) | Validação OK |
| 16 | Scanner USB Zebra (Windows) | Validação OK |
| 17 | Scanner USB genérico (Ubuntu) | Validação OK |
| 18 | Busca manual por nome | Validação OK |
| 19 | Check-in e Check-out | Status atualiza |
| 20 | Reentrada condicionada | Libera após checkout |

### Testes de Performance

| # | Cenário | Resultado Esperado |
|---|---------|-------------------|
| 21 | 10 terminais validando simultaneamente | Sem lentidão |
| 22 | Sync de 1000 tickets em 30s | Completa OK |
| 23 | 100 validações/terminal em 10min | Dashboard atualiza |
| 24 | Terminal offline por 5min, reconecta | Sync recupera |

---

### Checklist de Dispositivos

#### Smartphones Android
- [ ] Samsung Galaxy S21+ - Chrome - Câmera QR
- [ ] Samsung Galaxy S21+ - Chrome - Scanner USB
- [ ] Motorola Edge 30 - Chrome - Câmera QR
- [ ] Xiaomi Redmi Note 11 - Chrome - Câmera QR

#### Tablets Android
- [ ] Samsung Galaxy Tab S8 - Chrome - Câmera QR
- [ ] Samsung Galaxy Tab S8 - Chrome - Scanner USB

#### iPhone
- [ ] iPhone 14 - Safari - Câmera QR
- [ ] iPhone 14 - Safari - Scanner USB (lightning)
- [ ] iPhone 14 Pro - Safari - Câmera QR

#### iPad
- [ ] iPad 10 - Safari - Câmera QR
- [ ] iPad 10 - Safari - Scanner USB (USB-C)
- [ ] iPad Pro 12 - Safari Multitarefa - Câmera QR

#### Computadores
- [ ] Windows 10 + Chrome - Câmera QR
- [ ] Windows 10 + Chrome - Scanner USB Honeywell
- [ ] Windows 10 + Edge - Scanner USB Zebra
- [ ] Ubuntu 22.04 + Chrome - Scanner USB
- [ ] macOS 14 + Safari - Câmera QR
- [ ] macOS 14 + Chrome - Scanner USB

---

### Problemas Comuns e Soluções

#### iOS - Câmera não funciona
```
Verificar:
1. Settings > Safari > Câmera: Permitir
2. Settings > Safari > Microfone: Permitir  
3. HTTP vs HTTPS: câmera só funciona em HTTPS
4. Permitir pop-ups para o site
```

#### Scanner USB não responde
```
Verificar:
1. Scanner está em modo HID (não COM/serial)
2. Enter key está configurado como sufixo
3. Nenhum campo de input tem foco
4.Modo correto selecionado (USB ou Auto)
```

#### 10 terminais - "terminal suspended"
```
Verificar no banco:
SELECT slug, suspended, deleted_at FROM terminals WHERE slug = 'SLUG1';

1. suspended deve ser false
2. deleted_at deve ser NULL
```

---

### ✅ Critérios de Aprovação

O sistema está pronto para produção quando:

- [ ] Todos os testes de isolamento passam
- [ ] 10 terminais simultâneos funcionam sem conflitos
- [ ] QR codes geram e scaneiam corretamente
- [ ] Métricas aparecem em tempo real no dashboard
- [ ] Suspender/reativar terminais funciona
- [ ] Scanner USB reconhecido em Windows/Linux/macOS
- [ ] Câmera funciona em Android/iOS
- [ ] Nenhum erro no console do navegador
- [ ] Sync offline funciona corretamente

---

## Resumo de Arquivos por Fase

```
backend/
├── migrations/
│   └── 012_terminal_sessions.sql          [FASE 2]
├── src/
│   ├── middleware/
│   │   └── eventAccess.js                  [FASE 1]
│   └── modules/
│       ├── clients/
│       │   ├── clients.routes.js            [FASE 1]
│       │   └── clients.service.js           [FASE 1]
│       ├── dashboard/
│       │   ├── dashboard.controller.js      [FASE 4]
│       │   ├── dashboard.routes.js          [FASE 4]
│       │   └── dashboard.service.js         [FASE 4]
│       └── terminals/
│           ├── terminals.controller.js      [FASE 2, 3]
│           ├── terminals.routes.js           [FASE 2, 3]
│           └── terminals.service.js         [FASE 2, 3]

frontend/
├── src/
│   ├── components/
│   │   ├── admin/
│   │   │   └── TerminalQRModal.jsx          [FASE 3]
│   │   ├── dashboard/
│   │   │   └── TerminalMetricsPanel.jsx      [FASE 4]
│   │   ├── master/
│   │   │   ├── MasterTenantGate.jsx          [FASE 1]
│   │   │   └── TenantSelect.jsx              [FASE 1]
│   │   ├── ScannerInput.jsx                 [FASE 5]
│   │   └── ScannerSettings.jsx              [FASE 5]
│   ├── hooks/
│   │   └── useExternalScanner.js            [FASE 5]
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── EventsList.jsx               [FASE 1]
│   │   │   ├── EventDetail.jsx               [FASE 3]
│   │   │   └── TerminalManager.jsx           [FASE 3]
│   │   ├── supervisor/
│   │   │   └── EventDashboard.jsx            [FASE 4]
│   │   └── terminal/
│   │       ├── JoinTerminal.jsx              [FASE 2]
│   │       └── Terminal.jsx                  [FASE 5]
│   ├── services/
│   │   ├── api.js                           [FASE 1]
│   │   └── syncService.js                   [FASE 2]
│   ├── store/
│   │   └── scopeStore.js                    [FASE 1]
│   └── App.jsx                              [FASE 1, 3]
```

---

## Notas Importantes

1. **Ordem de Implementação**: Execute as fases na ordem (1 → 6). Cada fase depende das anteriores.

2. **Testes**: Execute `npm run dev` em ambos backend e frontend após cada fase.

3. **Banco de Dados**: Execute as migrations antes de testar funcionalidades novas.

4. **Backup**: Faça backup do banco de dados antes de aplicar migrations.

5. **Git**: Faça commit após cada fase concluída.

```bash
# Exemplo de workflow
git checkout -b feature/isolamento-master
# [implementar fase 1]
git add . && git commit -m "FASE 1: Correção de isolamento MASTER/Admin"
git checkout -b feature/terminais-genericos
# [implementar fase 2]
git add . && git commit -m "FASE 2: Suporte a terminais simultâneos"
# ... etc
```

---

*Documento gerado em: 2026-10-15*
