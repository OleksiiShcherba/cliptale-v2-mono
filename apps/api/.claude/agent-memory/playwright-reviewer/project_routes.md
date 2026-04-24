---
name: Route map and confirmed ports
description: Confirmed app routes and Docker Compose port mapping for Playwright tests
type: project
---

App URL: http://localhost:5173 (web-editor via Docker Compose, Vite)
API URL: http://localhost:3001 (Express API)

Route map:
- `/` — main editor shell (all panels: asset browser, preview player, timeline, topbar)

All testing is done against Docker Compose services — never run npm run dev directly.

**Why:** Docker Compose is the canonical dev environment for this project; bare localhost npm dev is not used.
**How to apply:** Always use http://localhost:5173 and http://localhost:3001 in Playwright scripts. Never start/stop Docker services.
