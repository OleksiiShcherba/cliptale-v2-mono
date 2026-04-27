---
name: ClipTale project environment
description: App URLs, ports, stack, and test asset locations for ClipTale web-editor E2E testing
type: project
---

App URL: http://localhost:5173 (Vite dev server via Docker Compose).
API URL: http://localhost:3001.
Stack: React 18 + Vite frontend, Express API backend.
Dev environment is Docker Compose — never run npm run dev yourself.

Test assets are in `./docs/test_assets/` at the repo root:
- test_video — use for video upload and clip tests
- test_image — use for image asset tests
- test_audio — use for audio upload and transcription tests

Persistent screenshots go to `./docs/test_screenshots/` (never delete).
Temp screenshots go to `./playwright-screenshots/` (always clean up after run).

**Why:** The app runs via docker compose up; ports are fixed.
**How to apply:** Always use http://localhost:5173, never start a dev server.
