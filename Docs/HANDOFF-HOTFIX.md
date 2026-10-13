# Handoff — Hotfix 2.5.x (falhas de produção)

> Executar uma sessão por conversa. Ao final de cada sessão: `npm test` verde,
> commit e registro abaixo.

## Ambientes / decisões

- Repositório git inicializado nesta série (`git init`), um commit por sessão.
- Migration `011_terminal_slug.sql` criada e aplicada no banco dev.
- Abordagem da Sessão 3 aprovada: **endpoints públicos por slug** (sem JWT).

---

## Sessão 1 — Terminal + portões resilientes

**Status:** DONE

### O que mudou (além do prompt original)

- `backend/src/modules/gates/gates.service.js`
  - `setTerminalGate`: removida a restrição que exigia portão aberto (422
    `gate_not_open`). O portão é informação de auditoria.
  - `getTerminalGate`: passa a retornar `gate_status` (`open`/`closed`).
- `backend/src/modules/validation/validation.service.js`
  - `resolveGate`: **não lança mais 422** quando o portão associado está
    fechado; retorna `null` e o `entry_log.gate_id` fica nulo. Esta era a
    falha real que bloqueava a validação em produção.
- `backend/src/modules/sync/sync.service.js`
  - `resolveOfflineGate`: aceita o log se `created_at >= opened_at`; caso
    contrário registra `gate_id: null` **sem erro** (antes lançava e perdia o log).
- `frontend/src/pages/terminal/Terminal.jsx`
  - Scanner sempre renderizado; removido o bloco "Selecione o portão…".
  - Subtítulo com aviso suave "⚠ Sem portão — toque para selecionar" e
    "(portão fechado)".
  - Seletor passa a listar **todos** os portões (não só abertos), com marcação
    "(fechado)".
  - `refreshFromLocal` / init preservam a referência ao portão fechado.
- `frontend/src/store/terminalStore.js`
  - Novo estado `gateOpen`; `setGate` aceita `gateOpen` opcional (não zera
    chamadas legadas); incluído no `partialize` do persist.

### Testes

- Backend `gates.test.js`: `T-gate-terminal-1`, `T-gate-terminal-2`,
  `T-gate-offline-1`, `T-gate-offline-2`.
- Frontend `terminal.test.jsx`: `T-terminal-no-gate`, `T-terminal-gate-warning`.
- Resultados: backend **91 passed / 14 suítes**; frontend **22 passed**;
  `npm run lint` limpo.

**Commit:** `fix(terminal): remover bloqueio de portão, aceitar gate fechado e corrigir sync offline`

---

## Sessão 2 — Reset de evento e purge

**Status:** DONE

### O que mudou (além do prompt original)

- `backend/src/modules/events/events.purge.js`
  - `purgeEventData(eventId, tenantId, userId, mode='full')` com dois modos:
    - `reset`: apaga `entry_logs`, `master_tickets`, `tickets`, `terminals`;
      limpa timestamps de `gates`; mantém `event_config`, `event_team`,
      `batches`, `gates`; status final `draft`.
    - `full`: comportamento original; exige `closed`; status `purged`.
  - Audit: `event_data_reset` / `event_data_purged`.
  - **Correção:** removido `updated_at = NOW()` do `UPDATE events`
    (a tabela `events` não possui a coluna — causava 500).
- `backend/src/modules/events/events.controller.js`
  - `purge` lê `req.body?.mode`.
  - Novo `resetAndReopen`: encerra se `active` via
    `eventsService.changeEventStatus(id, 'closed')` (o prompt citava um
    `changeStatus` inexistente) e chama o reset.
- `backend/src/modules/events/events.routes.js`
  - `POST /api/events/:eventId/reset-and-reopen` (admin/master + eventAccess).
- `frontend/src/services/eventsService.js`
  - `purgeEventData(eventId, mode='full')`; novo `resetAndReopenEvent(eventId)`.
- `frontend/src/components/PurgeEventModal.jsx`
  - Abas "Resetar (recomendado)" / "Apagar tudo"; reset exige apenas um
    clique; full purge exige digitar o nome do evento.
- `frontend/src/pages/admin/EventDetail.jsx`
  - Botão "Resetar e reabrir" na barra de ações do evento ativo + modal de
    confirmação. "Zona de Risco" passou a aparecer para `closed` **e** `draft`.

### Testes

- Backend `events.test.js`: `T-reset-1`..`T-reset-5`.
- Resultados: backend **96 passed / 14 suítes**; frontend **22 passed**;
  `npm run lint` limpo.

**Commit:** `feat(events): modo reset que mantém estrutura + botão resetar e reabrir`

