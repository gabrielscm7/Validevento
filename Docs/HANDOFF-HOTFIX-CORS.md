# Handoff — Hotfix CORS: header `X-Tenant-Id`

**Status:** DONE
**Data:** 2026-10-15
**Área:** backend (CORS) — decorrente do isolamento MASTER (Fase 1)

## Sintoma

Em produção (`https://www.validevento.com.br`), telas de admin do **MASTER**
(o ex. `/admin/usuarios`) exibiam *"Erro ao carregar clientes."* e listagens
não carregavam. Console do navegador:

```
Failed to load resource: net::ERR_BLOCKED_BY_CLIENT
api.validevento.com.br/api/auth/login:1  401 ()
usuarios:1 Access to XMLHttpRequest at
'https://api.validevento.com.br/api/users?tenant_id=...'
from origin 'https://www.validevento.com.br' has been blocked by CORS policy:
Request header field x-tenant-id is not allowed by
Access-Control-Allow-Headers in preflight response.
```

## Causa raiz

O isolamento MASTER passou a enviar o cliente selecionado em **toda** requisição
autenticada via header customizado `X-Tenant-Id`
(`frontend/src/services/api.js`). Porém o CORS do backend não listava esse
header em `Access-Control-Allow-Headers`. O navegador bloqueava a **preflight**
(OPTIONS) e a requisição real nem chegava ao servidor — daí falharem todas as
rotas escopadas por tenant (`/api/users`, `/api/events`, ...), não só
`/api/clients`.

> Os erros `net::ERR_BLOCKED_BY_CLIENT` e o `401` no login foram observados no
> ambiente do usuário (bloqueador de anúncios/extensão e credencial inválida) e
> **não** fazem parte desta correção.

## Correção

`backend/src/app.js` — `corsOptions`:

```js
allowedHeaders: [
  'Content-Type',
  'Authorization',
  'Cache-Control',
  'Pragma',
  'X-Tenant-Id',
],
exposedHeaders: ['X-Tenant-Id'],
```

Nenhuma outra alteração foi necessária: `OPTIONS` já constava em
`methods` e o middleware `cors()` responde à preflight automaticamente.

## Validação

- Teste de regressão em `backend/src/__tests__/implementation-guide.test.js`:
  *"CORS: preflight libera o header X-Tenant-Id"* — envia
  `Access-Control-Request-Headers: authorization,x-tenant-id` e verifica que a
  resposta traz `x-tenant-id` em `Access-Control-Allow-Headers`.
- Suíte backend completa verde; suíte frontend e lint sem alterações.

| Suíte | Resultado |
|---|---|
| Backend (`npm test`) | 129/129 |
| Frontend (`npm test`) | 44/44 |
| Lint (`npm run lint`) | 0 problemas |

## Arquivos alterados

```
backend/src/app.js
backend/src/__tests__/implementation-guide.test.js
Docs/ACESSO-MASTER.md
Docs/HANDOFF-HOTFIX-CORS.md           (este documento)
```

## Ação de deploy

Reiniciar o backend (Railway) para aplicar o novo `corsOptions`. Não há
migration nem alteração de frontend.
