# Handoff Validevento v2.4.1

## Sessao 1 - Correcoes criticas frontend

Status: concluida e commitada em `gabrielscm7/fix/pre-event-critical-patch`.

Commits:

- `0d6c108 fix(auth): verificar expiração do JWT ao restaurar sessão`
- `0279b81 fix(validation): processar retorno duplicate do confirmOnServer`
- `ccbd436 fix(sync): garantir id do Dexie no merge de snapshot`

Alteracoes:

- Sessao restaurada agora rejeita JWT expirado ou malformado.
- Confirmacao online processa respostas `duplicate` e atualiza o ticket local.
- Merge de snapshot preserva o `id` auto-incremental local do Dexie.
- Testes de regressao adicionados para os tres cenarios.

Verificacao:

- `npm test` em `frontend`: 5 arquivos, 19 testes aprovados.
- `npm run lint` em `frontend`: aprovado.

## Sessao 2

Pendente: login por e-mail ou CPF e purge de dados operacionais de eventos.
