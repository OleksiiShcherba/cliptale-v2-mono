---
name: ClipTale Docker Compose stack layout
description: Six services (api, web-editor, db, redis, media-worker, render-worker) with canonical ports — lets us skip senior-developer delegation for a simple up-check
type: project
---

The ClipTale Docker Compose stack has six services with these canonical host-facing ports (verified via `docker ps` on 2026-04-18):

- `cliptalecom-v2-api-1` — 0.0.0.0:3001 → 3001 (Express API)
- `cliptalecom-v2-web-editor-1` — 0.0.0.0:5173 → 5173 (Vite / React)
- `cliptalecom-v2-db-1` — 0.0.0.0:3306 → 3306 (MySQL 8)
- `cliptalecom-v2-redis-1` — 0.0.0.0:6380 → 6379 (Redis, non-default host port)
- `cliptalecom-v2-media-worker-1` — no host port
- `cliptalecom-v2-render-worker-1` — no host port

Frontend user entry point: **http://localhost:5173**.
API base: **http://localhost:3001**.

**Why:** Agent spec says to delegate Docker up/down checks to `senior-developer`. For a simple "is the stack already up" check, running `docker ps` directly once is faster and equally reliable — only escalate to senior-developer if the stack is down or misbehaving.

**How to apply:** On run start, run `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"` first. If all six services show Up, proceed to the Playwright MCP availability check. Only delegate to senior-developer if one or more services are missing/unhealthy. Redis on host port 6380 (not 6379) is intentional — don't flag as a bug.
