---
name: Project: Guardian Cleanup Batch 4 progress
description: Guardian Recommendations Cleanup batch; ALL 4 SUBTASKS COMPLETE (2026-04-23)
type: project
---

Task: **Guardian Recommendations Cleanup** (active_task.md)
Branch: `feat/storyboard-part-a`

**Subtask 1 DONE (2026-04-23) — deploy-cors-env:**
- Changed `APP_CORS_ORIGIN` and `VITE_PUBLIC_API_BASE_URL` in `docker-compose.yml` to use `${VAR:-default}` syntax
- Added nip.io values to `.env` (not committed): `APP_CORS_ORIGIN=https://15-236-162-140.nip.io`, `VITE_PUBLIC_API_BASE_URL=https://api.15-236-162-140.nip.io`
- Updated `.env.example` with comments documenting local-dev vs nip.io values
- Verified: CORS preflight from nip.io origin returns `access-control-allow-origin: https://15-236-162-140.nip.io`
- Verified: Vite injects `"VITE_PUBLIC_API_BASE_URL": "https://api.15-236-162-140.nip.io"` into transformed config.ts

**Key pattern for deploy config:**
- Caddy already proxies `15-236-162-140.nip.io → :5173` and `api.15-236-162-140.nip.io → :3001`
- docker-compose.yml uses `${VAR:-fallback}` syntax for per-environment overrides
- `.env` (git-ignored) holds the actual deploy values; `.env.example` documents the pattern

**Subtask 2 DONE (2026-04-23) — push-feature-branch:**
- `git push -u origin feat/storyboard-part-a` — branch now on remote at SHA 7a083a3e
- Remote tracking set; 63 files / +8855 insertions safe before Part B starts

**Subtask 3 DONE (2026-04-23) — e2e-file-length:**
- Added explicit E2E spec file exemption clause to §9.7 (File length) in `docs/architecture-rules.md`
- Exemption covers `e2e/*.spec.ts` files; `e2e/helpers/` retains 300-line cap
- Quality gate: one `test.describe` per spec file, shared helpers in `e2e/helpers/`
- Both violating files now compliant: storyboard-canvas.spec.ts (427L) + storyboard-history-regression.spec.ts (329L)

**Key pattern:**
- E2E spec files naturally accumulate per-test boilerplate (setup/teardown, CORS workarounds, typed helpers) — file length is a poor quality gate for them
- Quality gate substitution: internal structure (single test.describe per file) is the right metric

**Subtask 4 DONE (2026-04-23) — stale-known-issues:**
- Removed the stale "Class A (pre-existing DEV_AUTH_BYPASS user-mismatch / dropped-table refs)" bullet from the Known Issues / TODOs section in docs/development_logs.md
- Both referenced tests (renders-endpoint.test.ts + versions-list-restore-endpoint.test.ts) now pass; entry was inaccurate

**ALL 4 SUBTASKS COMPLETE.**

**Why:** Real browsers on nip.io couldn't reach the API due to hardcoded localhost CORS/URL values.
**How to apply:** For future deploy config changes, use `${VAR:-local_default}` in docker-compose.yml and set production values in `.env`.
