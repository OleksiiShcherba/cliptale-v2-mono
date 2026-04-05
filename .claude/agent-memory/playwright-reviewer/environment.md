---
topic: environment
updated: 2026-04-05
---

ClipTale runs via Docker Compose. Never start services manually.

- **web-editor:** `http://localhost:5173` (React + Vite, port 5173:5173)
- **api:** `http://localhost:3001` (Express, port 3001:3001)
- **db:** MySQL on port 3306
- **redis:** port 6380 (mapped from 6379 internally)

**Why:** All services are wired together via Compose networking; bare `npm run dev` won't have the right env vars.

**Impact:** Always use `http://localhost:5173` as APP_URL for Playwright. If unreachable, tell user to run `docker compose up` before testing.
