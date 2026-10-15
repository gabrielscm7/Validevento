# Deprecated Files

This directory contains files that are no longer used in production but kept for reference or local development purposes.

## Files Moved Here

| File | Moved By | Reason |
|------|----------|--------|
| `Dockerfile.frontend` | Milestone 3 | Railway builds the frontend with Nixpacks (`frontend/railway.json` → `npm run build` + `node server.js`). Its nginx-based image was never used and relied on `nginx.conf`. |
| `Dockerfile.backend` | Milestone 3 | Railway builds the backend with Nixpacks (`backend/railway.json`). Nothing in the repo referenced this file. |
| `nginx.conf` | Milestone 3 | Only consumed by `Dockerfile.frontend`. Its `proxy_pass ${API_URL}` placeholder was never substituted, so the proxy would be broken. |

## How to Clean Up

When ready to remove deprecated files entirely:

```bash
rm -rf Docs/deprecated/
git add -A && git commit -m "chore: remove deprecated files"
```
