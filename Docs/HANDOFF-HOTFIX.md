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
