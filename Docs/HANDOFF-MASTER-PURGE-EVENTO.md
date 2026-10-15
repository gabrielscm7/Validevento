# Handoff — Master pode apagar eventos em qualquer status

**Status:** DONE
**Data:** 2026-10-15
**Área:** eventos (purge) + UI master

## Contexto

O endpoint `DELETE /api/events/:eventId/purge` já aceitava `admin` e `master`,
mas o purge `full` **exigia `event.status === 'closed'`**. Eventos em `draft`
(nunca ativados) ou `active` ficavam impossibilitados de exclusão total, mesmo
para o master.

## Mudança

O `master` passa a **ignorar a exigência de evento encerrado** no purge `full`.
Admin mantém a regra (só `closed`).

- `backend/src/modules/events/events.purge.js`
  - `purgeEventData(eventId, tenantId, userId, mode, userRole)` — novo parâmetro
    `userRole`; a checagem `mode === 'full' && status !== 'closed'` é ignorada
    quando `userRole === 'master'`.
- `backend/src/modules/events/events.controller.js`
  - handler `purge` passa `req.user.role`.
- `frontend/src/pages/master/ClientDetail.jsx`
  - botão 🗑 exibido para eventos em qualquer status (desabilitado apenas para
    `purged`); antes só aparecia em `closed`/`purged`.
- `frontend/src/pages/admin/EventDetail.jsx`
  - "Zona de Risco" passa a aparecer também para o master em eventos `active`
    (antes só `closed`/`draft`); nunca exibida para `purged`.

## Regras de acesso

| Papel | Reset (`active`/`closed`) | Full purge `closed` | Full purge `draft`/`active` |
|---|---|---|---|
| admin | sim | sim | não (422 `event_not_closed`) |
| master | sim | sim | **sim** |

- Master continua exigindo cliente selecionado (`X-Tenant-Id`); sem isso recebe
  `403 tenant_context_required` (`eventAccessRequireTenant`).
- Evento já `purged` continua bloqueado (`422 already_purged`) para todos.
- `admin` sem `tenant` correspondente permanece isolado ao próprio tenant.

## Testes

`backend/src/__tests__/events.test.js`:
- `T-reset-6` — admin não purga `draft` (422).
- `T-reset-7` — master purga `draft` (200 → `purged`).
- `T-reset-8` — master purga `active` (200 → `purged`).
- `T-reset-9` — master sem `X-Tenant-Id` recebe 403.

| Suíte | Resultado |
|---|---|
| Backend (`npm test`) | 133/133 |
| Frontend (`npm test`) | 44/44 |
| Lint (`frontend: npm run lint`) | 0 problemas |
| Build (`frontend: npm run build`) | OK |

Sem migration — apenas lógica de negócio e UI.
