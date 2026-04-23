---
name: 2026-04-23 Guardian Cleanup Final batch verification anchors
description: Final cleanup batch (docker-compose parametrize, remote push, §9.7 E2E exemption, stale Known Issue removal); verified against live deploy + docker test suites
type: project
---

Batch scope: Guardian Recommendations Cleanup (4 subtasks as entries in uncompacted log).

**Verdict: HEALTHY** — pure documentation + infra-config work, zero production code changes.

**Verified anchors:**
- `.env.example` lines 43-50: `APP_CORS_ORIGIN` + `VITE_PUBLIC_API_BASE_URL` now documented with local + nip.io variants.
- `docker-compose.yml` lines 57, 79: parametrized via `${VAR:-localhost-fallback}` — running API container picks up `https://15-236-162-140.nip.io` for CORS; web-editor picks up `https://api.15-236-162-140.nip.io`.
- **Why:** without this the bind-mounted FE at https://15-236-162-140.nip.io was hard-coded to call localhost:3001 — deploy was unreachable to real clients. Now caddy+nip.io fully wired. Live curl confirms `access-control-allow-origin: https://15-236-162-140.nip.io` on `/health`.
- `docs/architecture-rules.md` §9.7: "E2E spec file exemption" added — `e2e/*.spec.ts` exempt from 300L cap; quality gate = one `test.describe` per file. Verified: storyboard-canvas.spec.ts (427L) + storyboard-history-regression.spec.ts (329L) each have exactly 1 describe block.
- `docs/architecture-rules.md` §10: "Running Vitest inside Docker containers" section added — documents the `-w /app/apps/<pkg>` gotcha.
- Commit `7a083a3 feat/storyboard-part-a` on `origin` — local and remote in sync.
- Known Issues bullet "Class A DEV_AUTH_BYPASS / dropped-table" removed from development_logs.md. Verified: renders-endpoint (10/10) + versions-list-restore (10/10) + assets-finalize (4/4) + assets-list (3/3) all green.

**Test suite state (Docker Compose verified):**
- apps/api: 116 files / 1168 passed / 5 skipped / 2 todo (cors.test.ts correctly skipped — no infra/s3/cors.json in container)
- apps/web-editor: 208 files / 2362 passed / 0 failed
- packages/api-contracts: 5 files / 89 passed on HOST; **only 3 files / 40 passed inside web-editor container** because api-contracts is NOT bind-mounted (see Gotcha below)

**Gotcha — api-contracts not bind-mounted:**
- `docker-compose.yml web-editor.volumes` mounts `project-schema`, `ui`, `editor-core`, `remotion-comps` — NOT `api-contracts`
- `packages/api-contracts/src/` inside web-editor container is STALE (baked at build time; missing this-batch `openapi.storyboard.paths.test.ts` + `.schemas.test.ts`)
- `openapi.ts` in web-editor container has 4 `storyboard` refs vs host's 35 — stale
- The new architecture-rules.md recommended command `docker compose exec -T -w /app/packages/api-contracts web-editor npx vitest run` silently picks up the stale files
- api container DOES have up-to-date api-contracts src (rebuilt recently)
- **Minimal impact:** api-contracts openapi.ts is contract documentation, not runtime — FE fetch paths are hand-coded in `features/storyboard/api.ts`. But the documented test command will produce a false-lower-than-reality test count until web-editor image is rebuilt.

**Batch commit status:**
- The BATCH ITSELF (this cleanup work) is entirely UNCOMMITTED (29 modified/deleted + many untracked in .claude/agent-memory + playwright-report churn). The prior Storyboard Part A batch IS committed (7a083a3) and pushed.

**Direction alignment:** ALIGNED. This was pure hygiene cleanup following the Storyboard Part A ship — the product direction (AI video editor w/ storyboard wizard → editor pipeline) is untouched. Storyboard Part B (scene modal, library, effects) remains the next planned epic per general_tasks.md lines 26-60.
