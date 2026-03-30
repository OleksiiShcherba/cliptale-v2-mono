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

**Remaining subtasks (2–7) stay in `docs/active_task.md`.**

