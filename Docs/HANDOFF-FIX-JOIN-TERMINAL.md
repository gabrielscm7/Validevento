# Handoff — Fix: entrada no terminal genérico (botão "Entrar")

**Status:** DONE
**Data:** 2026-10-15
**Área:** frontend — `JoinTerminal`

## Sintoma

Na página pública `/terminal/join/:slug` (ex.: `JEUFDG`, evento ativo, terminal
não suspenso):

- A página carregava e mostrava terminal/evento (o `GET /api/terminal/join/:slug`
  funcionava).
- Ao clicar em **"Entrar como validador"**, aparecia imediatamente
  *"Não foi possível entrar no terminal. Verifique o link com o responsável pelo evento."*
- **Nenhum `POST /api/terminal/join/:slug/open` aparecia no Network** e a consola
  não mostrava erros.

## Causa raiz

`frontend/src/pages/terminal/JoinTerminal.jsx`:

```jsx
onClick={handleEnter}          // ❌ passa o evento de clique como argumento
```

`handleEnter(maxAttempts = 3)` recebia o **SyntheticEvent** como `maxAttempts`.
O loop:

```js
for (let attempt = 1; attempt <= maxAttempts; attempt++) { ... }
```

comparava `1 <= <SyntheticEvent>`. A coerção do objeto → `NaN`, e `1 <= NaN` é
`false` → **o corpo do loop nunca executava**. Nenhum `api.post()` era enviado;
em seguida `setError(lastError?.response?.data?.details || 'Não foi possível...')`
exibia o fallback (com `lastError` indefinido).

O `onKeyDown` do campo de nome já chamava `handleEnter()` corretamente — por isso
o bug só ocorria com o clique no botão.

### Hipótese descartada

Chegou-se a suspeitar do Service Worker (Workbox) a interceptar o POST. Foi
descartada: o `runtimeCaching` de `/api/*` (`vite.config.js`) é registado **sem
`method`**, e o `registerRoute` do Workbox assume `GET` por padrão (confirmado no
`dist/sw.js`: `registerRoute(/^https:\/\/.*\/api\//, new NetworkFirst(...))`).
POSTs não são interceptados. O `vite.config.js` **não foi alterado**.

> Também foi descartado o `VITE_API_URL` (correto no Railway) e um `fetch`
> manual da consola que devolveu HTML — esse usou URL **relativa**, logo bateu no
> origin do frontend (`www`), não no backend.

## Correção

```jsx
onClick={() => handleEnter()}   // ✅
```

Alteração mínima de 1 linha. Nenhuma mudança de backend, Workbox ou variáveis de
ambiente é necessária.

## Testes

`frontend/src/__tests__/joinTerminal.test.jsx` — novo `T-join-enter`:
renderiza o join, clica no botão e verifica que
`POST /api/terminal/join/:slug/open` é chamado e que há navegação para o terminal
(`/terminal/join/:slug/app`), sem exibir a mensagem de erro.

Verificação de regressão: com `onClick={handleEnter}` o teste **falha**; com
`onClick={() => handleEnter()}` **passa**.

| Suíte | Resultado |
|---|---|
| Frontend (`npm test`) | 45/45 |
| Lint (`npm run lint`) | 0 problemas |
| Build (`npm run build`) | OK |

## Arquivos alterados

```
frontend/src/pages/terminal/JoinTerminal.jsx
frontend/src/__tests__/joinTerminal.test.jsx
Docs/HANDOFF-FIX-JOIN-TERMINAL.md        (este documento)
```

## Ação de deploy

Rebuild + deploy do frontend. Usuários com o app instalado (PWA) devem fechar e
reabrir (ou aguardar o `autoUpdate`) para receber o bundle novo.
