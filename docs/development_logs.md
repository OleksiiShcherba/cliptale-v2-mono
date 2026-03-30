# Development Log

---

## 2026-03-29

### Task: EPIC 1 — Asset Manager & Upload Pipeline
**Subtask:** 1. Scaffold monorepo structure

**What was done:**
- Created root `package.json` (npm workspaces: `apps/*`, `packages/*`) and `turbo.json` with build/dev/lint/test/typecheck pipeline tasks
- Created root `tsconfig.json` with strict-mode TypeScript baseline (extended by all apps/packages)
- Created `.env.example` with all required variables: DB, Redis, S3/R2, JWT, OpenAI, API server, Vite API URL
- Created `.gitignore` covering `node_modules`, `dist`, `.env`, `.turbo`, `coverage`
- Created `docker-compose.yml` with `db` (MySQL 8.0) and `redis` (Redis 7 Alpine) services; DB mounts migrations dir as init scripts
- Scaffolded `apps/api/` — `package.json`, `tsconfig.json`, `src/index.ts` (Express + helmet + cors + rate-limit), `src/config.ts`, `src/db/connection.ts`, `src/queues/bullmq.ts` (Queue definitions for `media-ingest`, `render`, `transcription`)
- Scaffolded `apps/web-editor/` — `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx` (React 18 + QueryClientProvider), `src/lib/config.ts`, `src/lib/api-client.ts`; all feature subdirectories created
- Scaffolded `apps/media-worker/` — `package.json`, `tsconfig.json`, `src/config.ts`, `src/index.ts` (BullMQ Worker stub on `media-ingest` queue)
- Scaffolded `apps/render-worker/` — `package.json`, `tsconfig.json`, `src/config.ts`, `src/index.ts` (BullMQ Worker stub on `render` queue)
- Scaffolded `packages/project-schema/` — Zod schemas for `ProjectDoc`, `Track`, `Clip` (discriminated union: `VideoClip | AudioClip | TextOverlayClip`), TypeScript type exports; `src/index.ts` barrel
- Scaffolded `packages/api-contracts/` — empty stub (`src/index.ts`); will be populated with OpenAPI-generated client in subtask 4+
- Scaffolded `packages/ui/` — empty stub; shared React components added per feature
- Scaffolded `packages/editor-core/` — empty stub; timeline math/Immer patch logic added per feature
- Scaffolded `packages/remotion-comps/` — `VideoComposition.tsx` (root composition consuming `ProjectDoc`), `VideoLayer.tsx` (dual-mode: `<OffthreadVideo>` in SSR, `<Video>` in browser), `AudioLayer.tsx`, `ImageLayer.tsx`, `TextOverlayLayer.tsx`, `useRemotionEnvironment.ts` hook
- Wrote unit tests (Vitest, co-located): `clip.schema.test.ts` (14 cases covering happy path, defaults, edge cases, discriminated union routing) and `project-doc.schema.test.ts` (7 cases covering defaults, required fields, invalid values)

**Notes:**
- Package scope uses `@ai-video-editor/` for shared packages (as referenced in `architecture-rules.md` import examples) and `@cliptale/` for apps — consistent with the monorepo root name
- `docker-compose.yml` mounts `apps/api/src/db/migrations/` as MySQL init scripts so running `docker compose up` automatically applies migrations — this is the intended workflow for subtask 2
- Subtasks 2 (DB migration) and 3 (Redis/BullMQ infra) are unblocked and can proceed in parallel — both were partially addressed here (Redis is in Docker Compose, BullMQ queue names defined)
- `packages/api-contracts/` is a stub — the typed API client pattern (calling `apiClient.assets.createUploadUrl(...)`) requires the OpenAPI spec to exist first; the `lib/api-client.ts` in web-editor uses a plain fetch wrapper until then

checked by code-reviewer - YES
checked by qa-reviewer - YES

**Review fixes applied (2026-03-30):**
- Fixed all backend env var names to use `APP_` prefix across `apps/api/src/config.ts`, `apps/media-worker/src/config.ts`, `apps/render-worker/src/config.ts`, and `.env.example`
- Added Zod startup validation + `process.exit(1)` in all three backend config modules; frontend config throws instead of `process.exit` (browser environment)
- Fixed frontend env var to `VITE_PUBLIC_API_BASE_URL` in `apps/web-editor/src/lib/config.ts` and `.env.example`
- Added `zod` dependency to `apps/media-worker/package.json` and `apps/render-worker/package.json`
- Added JSDoc comments to all exported types in `packages/project-schema/src/types/index.ts`
- Note: `api-client.ts` plain-fetch stub is intentional — will be replaced with typed client at subtask 4

**Remaining subtasks (2–7) stay in `docs/active_task.md`.**

---

## 2026-03-30

### Task: EPIC 1 — Asset Manager & Upload Pipeline
**Subtask:** 2. DB migration — `project_assets_current` table

**What was done:**
- Created `apps/api/src/db/migrations/001_project_assets_current.sql`
- Table has all required columns: `asset_id` (PK, CHAR(36)), `project_id`, `user_id`, `filename`, `content_type`, `file_size_bytes`, `storage_uri`, `status` (ENUM: `pending|processing|ready|error`, default `pending`), `error_message`, `duration_frames`, `width`, `height`, `fps`, `thumbnail_uri`, `waveform_json` (JSON), `created_at`, `updated_at`
- Composite index `idx_project_assets_project_status` on `(project_id, status)` for the most common query pattern (list assets for a project filtered by status)
- Migration is idempotent via `CREATE TABLE IF NOT EXISTS`
- MySQL will auto-execute this on first Docker Compose boot via the `docker-entrypoint-initdb.d` volume mount already configured in `docker-compose.yml`

**Notes:**
- `fps` is stored as `DECIMAL(10, 4)` to avoid floating-point drift (e.g. 29.9700 for 29.97fps NTSC)
- `waveform_json` uses MySQL `JSON` column type — no separate JSON blob column needed; MySQL validates JSON on write
- No unit test written: architecture-rules.md §testing explicitly states "Do NOT test: repository SQL correctness (that is integration test territory)"
- No separate migrate script added: docker-compose mounts `apps/api/src/db/migrations/` to `docker-entrypoint-initdb.d` so MySQL runs it automatically on first boot
- Integration test added at `apps/api/src/__tests__/integration/migration-001.test.ts` — bootstraps the integration test infrastructure for the API; covers: table existence, idempotency, all column types/nullability, ENUM default (`pending`), ENUM rejection of invalid values, composite index presence

**Completed subtask from active_task.md:**
<details>
<summary>Subtask: 2. DB migration — `project_assets_current` table</summary>

- What: Write and run the numbered SQL migration that creates the `project_assets_current` table with columns `asset_id`, `project_id`, `user_id`, `filename`, `content_type`, `file_size_bytes`, `storage_uri`, `status` (`pending | processing | ready | error`), `error_message`, `duration_frames`, `width`, `height`, `fps`, `thumbnail_uri`, `waveform_json`, `created_at`, `updated_at`; add index on `(project_id, status)`
- Where: `apps/api/src/db/migrations/001_project_assets_current.sql`
- Why: The presigned URL endpoint must insert a `pending` row — the table must exist before any BE code runs
- Depends on: subtask 1 ✅

</details>

checked by code-reviewer - OK
checked by qa-reviewer - YES
