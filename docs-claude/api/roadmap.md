## apps/api — Domain Roadmap
> Part of: [← Project Roadmap](../roadmap.md)
> Generated: 2026-04-13 | 144 files

---

## Responsibility
Express REST API. Owns all user/project state in MySQL, hands out presigned S3 URLs for media, enqueues BullMQ jobs for workers (ingest / transcription / render / AI generation), and enforces auth + ACL on every mutation. No heavy lifting — all media work is offloaded to workers.

---

## Layered Architecture

Strict 4-layer shape enforced across every feature:

```
routes/          ← Express Router: URL + middleware wiring only
  ↓
controllers/     ← Parse req, call service, write res. No business logic, no SQL.
  ↓
services/        ← Business logic. Throws typed errors from lib/errors.
  ↓
repositories/    ← Raw SQL via mysql2 pool. Only layer that touches the DB.
```

**Invariants:**
- Only `db/connection.ts` creates a pool; only repositories import `pool`.
- Only `config.ts` reads `process.env`.
- Repositories throw only on DB failure — never `ValidationError`/`NotFoundError`.
- Controllers never `throw` — they call `next(err)` via `express-async-errors`-style pattern or let services throw.
- Central error handler in `src/index.ts` maps typed errors → HTTP status.

---

## Structure

```
apps/api/src/
  index.ts               ← App bootstrap: helmet, cors, rate limit, router mount, error handler
  config.ts              ← Zod-validated env — the ONLY process.env reader
  db/
    connection.ts        ← mysql2 pool singleton
    migrations/*.sql     ← 001–018, auto-run by docker-compose MySQL init
  routes/                ← 8 routers (auth, assets, captions, clips, projects, versions, renders, aiGeneration)
  controllers/           ← Request parsing + Zod body schemas, thin wrappers over services
  services/              ← Business logic; co-located .test.ts per domain
  repositories/          ← Raw SQL; one file per table/aggregate
  middleware/            ← auth, acl, validate, auth.rate-limiters, auth.schema
  queues/
    bullmq.ts            ← Shared ioredis connection + 4 Queue singletons
    jobs/
      enqueue-ingest.ts       → media-ingest
      enqueue-transcription.ts → transcription
      enqueue-render.ts       → render
      enqueue-ai-generate.ts  → ai-generate
  lib/
    errors.ts            ← Typed error classes
    s3.ts                ← AWS SDK v3 S3Client singleton
    redis.ts             ← Redis client (for rate-limit counters / cache)
    elevenlabs-catalog.ts ← Voice catalog with Redis cache
  types/
    express.d.ts         ← Augments Request with req.user
  __tests__/
    integration/         ← Vitest integration tests (real MySQL via docker-compose)
    smoke/               ← External-provider smoke tests (fal.ai live call)
```

---

## REST Routes Reference

### Auth (`routes/auth.routes.ts`)
| Method | Path | Middleware | Controller |
|---|---|---|---|
| POST | `/auth/register` | `registerLimiter`, validate | `auth.register` |
| POST | `/auth/login` | `loginLimiter`, validate | `auth.login` |
| POST | `/auth/logout` | — | `auth.logout` |
| POST | `/auth/forgot-password` | validate | `auth.forgotPassword` |
| POST | `/auth/reset-password` | validate | `auth.resetPassword` |
| POST | `/auth/verify-email` | validate | `auth.verifyEmail` |
| GET  | `/auth/me` | `authMiddleware` | `auth.getMe` |
| GET  | `/auth/google` / `/auth/google/callback` | — | `oauth.googleRedirect/Callback` |
| GET  | `/auth/github` / `/auth/github/callback` | — | `oauth.githubRedirect/Callback` |

### Projects (`routes/projects.routes.ts`)
| Method | Path | Controller |
|---|---|---|
| POST | `/projects` | `projects.createProject` (returns `{ projectId }`) |

### Assets (`routes/assets.routes.ts`)
| Method | Path | Middleware | Notes |
|---|---|---|---|
| POST | `/projects/:id/assets/upload-url` | auth + ACL(editor) + validate | Presigned S3 PUT + pending asset row |
| GET  | `/projects/:id/assets` | auth | List project assets |
| GET  | `/assets/:id` | auth | Single asset (FE polling) |
| DELETE | `/assets/:id` | auth | Fails if referenced by any clip |
| PATCH | `/assets/:id` | auth + ACL(editor) + validate | Rename (display name) |
| POST | `/assets/:id/finalize` | auth + ACL(editor) | Verifies S3 object, enqueues `media-ingest` |
| GET  | `/assets/:id/thumbnail` | auth | Proxies S3 thumbnail |
| GET  | `/assets/:id/stream` | auth | Range-forwarding S3 proxy (keeps `s3://` URIs private) |

### Clips (`routes/clips.routes.ts`)
| Method | Path | Notes |
|---|---|---|
| POST | `/projects/:id/clips` | Creates clip row after split/duplicate |
| PATCH | `/projects/:id/clips/:clipId` | **High-freq** (drag/trim): per-project rate limit `60/s` via `keyGenerator` on `req.params.id`; does NOT create a version snapshot |

### Versions (`routes/versions.routes.ts`)
| Method | Path | Notes |
|---|---|---|
| POST | `/projects/:id/versions` | **Optimistic lock** on `parentVersionId` — 409 on stale; 422 on unsupported `doc_schema_version` |
| GET  | `/projects/:id/versions` | Last 50 summaries (newest first) |
| POST | `/projects/:id/versions/:versionId/restore` | Atomic restore, writes audit event |

### Renders (`routes/renders.routes.ts`)
| Method | Path | Notes |
|---|---|---|
| POST | `/projects/:id/renders` | Validates preset, checks version ownership, **per-user 2-concurrent limit** (409), enqueues `render` |
| GET  | `/renders/:jobId` | Status + progressPct + (when done) presigned `downloadUrl` |
| GET  | `/projects/:id/renders` | All renders for a project, newest first |

### Captions (`routes/captions.routes.ts`)
| Method | Path | Notes |
|---|---|---|
| POST | `/assets/:id/transcribe` | Enqueues Whisper; 409 if caption track already exists |
| GET  | `/assets/:id/captions` | Segments JSON; 404 until worker finishes |

### AI Generation (`routes/aiGeneration.routes.ts`)
| Method | Path | Notes |
|---|---|---|
| GET  | `/ai/models` | Static catalog (FAL + ElevenLabs) grouped by capability |
| GET  | `/ai/voices` | User's cloned voices from `user_voices` |
| GET  | `/ai/voices/available` | ElevenLabs library catalog (Redis-cached via `elevenlabs-catalog.ts`) — registered before `:voiceId/sample` to avoid param collision |
| GET  | `/ai/voices/:voiceId/sample?previewUrl=...` | Presigned S3 URL for sample audio |
| POST | `/projects/:id/ai/generate` | 202 Accepted; inserts `ai_generation_jobs` row, enqueues `ai-generate` |
| GET  | `/ai/jobs/:jobId` | Poll: status / progress / resultAssetId / resultUrl / errorMessage |

---

## Services (business logic)

| Service | Key responsibilities |
|---|---|
| `auth.service.ts` | Register/login/logout; bcrypt cost 12; 32-byte random session token (SHA-256 at rest); 7d session TTL; 1h reset token TTL; 24h verify token TTL. Calls `email.service` for reset/verify mails |
| `oauth.service.ts` | Google + GitHub OAuth flow. Returns same `AuthResult` shape as password login |
| `project.service.ts` | Create project (UUID), initial empty ProjectDoc seed |
| `asset.service.ts` (+ `.finalize`, `.response`, `.delete`, `.rename`) | Presigned upload URL, finalize (probe S3 → pending→processing → enqueue ingest), delete with clip-reference check, rename (display name) |
| `clip.service.ts` | Create clip row; patch mutable timeline fields (drag/trim). Does NOT snapshot a version |
| `version.service.ts` | Persist version with optimistic lock; list; restore; writes audit rows |
| `caption.service.ts` | Enqueue transcription; fetch segments from `caption_tracks` |
| `render.service.ts` | Preset table (`ALLOWED_PRESETS`: 1080p/4k/720p/vertical/square/webm), per-user 2-concurrent guard, enqueue; get status + presigned `downloadUrl` (TTL 3600s) |
| `aiGeneration.service.ts` | Validate submit against `AI_MODELS` catalog, enforce kling-o3 prompt XOR, resolve asset URL fields via `aiGeneration.assetResolver`, enqueue `ai-generate`, insert job row. API never sees provider keys (workers own them) |
| `aiGeneration.assetResolver.ts` | Resolves `s3://` refs in options → presigned HTTPS for the worker to fetch |
| `falOptions.validator.ts` | Schema-driven validation of per-model option bags against `FAL_MODELS` |
| `voiceCatalog.service.ts` | ElevenLabs voice catalog with Redis cache |
| `email.service.ts` | Transactional email sender (reset, verify) |

---

## Repositories (raw SQL)

| Repo | Table(s) |
|---|---|
| `user.repository.ts` | `users` |
| `session.repository.ts` | `user_sessions` (hashed tokens, expiry) |
| `password-reset.repository.ts` | `password_resets` |
| `email-verification.repository.ts` | `email_verifications` |
| `project.repository.ts` | `projects`, `latest_version_id` pointer |
| `asset.repository.ts` | `project_assets_current` |
| `clip.repository.ts` | `project_clips_current` |
| `caption.repository.ts` | `caption_tracks` |
| `version.repository.ts` | `project_versions` (JSON doc, optimistic `parent_version_id`) |
| `render.repository.ts` | `render_jobs` |
| `aiGenerationJob.repository.ts` | `ai_generation_jobs` (status enum: `queued`/`processing`/`done`/`failed`) |
| `voice.repository.ts` | `user_voices` (ElevenLabs per-user) |

---

## Middleware

| File | Purpose |
|---|---|
| `auth.middleware.ts` | Validates `Bearer` token from `Authorization` header OR `?token=` query (for `<img>`/`<video>`/Remotion `prefetch`). Bypassed when `config.auth.devAuthBypass` — attaches `dev-user-001` |
| `acl.middleware.ts` | `aclMiddleware('editor' \| 'viewer')` — checks project membership before the controller runs |
| `validate.middleware.ts` | `validateBody(schema)` / `validateQuery(schema)` — Zod → 400 on failure |
| `auth.schema.ts` | Zod bodies: register/login/forgot/reset/verify |
| `auth.rate-limiters.ts` | `registerLimiter`, `loginLimiter` (per-IP) — stricter than the global `rateLimit({ max: 200 })` in `index.ts` |

Global middleware stack (in `index.ts` order):
```
helmet() → cors({ origin, credentials: true }) → express.json() → rateLimit(200/min)
→ routers → central error handler
```

---

## Queues (producer side)

`queues/bullmq.ts` creates a shared `ioredis` connection and four queues:

| Constant | Name | Consumer |
|---|---|---|
| `QUEUE_MEDIA_INGEST` | `media-ingest` | media-worker `ingest.job.ts` |
| `QUEUE_TRANSCRIPTION` | `transcription` | media-worker `transcribe.job.ts` |
| `QUEUE_AI_GENERATE` | `ai-generate` | media-worker `ai-generate.job.ts` / `ai-generate-audio.handler.ts` |
| `QUEUE_RENDER` | `render` | render-worker `render.job.ts` |

Producers in `queues/jobs/`:
- `enqueue-ingest.ts` → called by `asset.finalize.service`
- `enqueue-transcription.ts` → called by `caption.service` (or auto from `ingest` via worker)
- `enqueue-render.ts` → called by `render.service.createRender`
- `enqueue-ai-generate.ts` → called by `aiGeneration.service.submitGeneration`

Each producer imports `connection` from `queues/bullmq.ts` so a single pool is reused.

---

## DB Migrations (`db/migrations/*.sql`)

Runs automatically on MySQL container startup via `docker-entrypoint-initdb.d`. **To re-seed locally:** `docker compose down -v && docker compose up`.

| # | File | Purpose |
|---|---|---|
| 001 | `project_assets_current.sql` | Assets table |
| 002 | `caption_tracks.sql` | Caption tracks |
| 003 | `project_versions.sql` | Version snapshots (JSON, `parent_version_id` for optimistic lock) |
| 004 | `render_jobs.sql` | Export jobs |
| 005 | `project_clips_current.sql` | Denormalized current clips |
| 006 | `seed_dev.sql` | Dev seed data |
| 007 | `add_image_clip_type.sql` | ENUM widen — image |
| 008 | `users_auth.sql` | Users + sessions + password reset + email verify + OAuth link tables |
| 009 | `ai_provider_configs.sql` | (later dropped in 013) |
| 010 | `ai_generation_jobs.sql` | Unified AI job queue |
| 011 | `seed_dev_user.sql` | Dev user for bypass |
| 012 | `add_result_url_to_ai_jobs.sql` | Result URL column |
| 013 | `drop_ai_provider_configs.sql` | Providers moved to worker-owned config |
| 014 | `ai_jobs_fal_reshape.sql` | FAL-shaped option/prompt columns |
| 015 | `ai_jobs_audio_capabilities.sql` | Audio capability fields |
| 016 | `user_voices.sql` | Per-user ElevenLabs voice library |
| 017 | `asset_display_name.sql` | Rename support |
| 018 | `add_caption_clip_type.sql` | ENUM widen — caption |

**Adding a new migration:** next number, ascending; must be idempotent-friendly (use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is not MySQL-standard — test by wiping the volume).

---

## Testing

- **Unit/integration:** Vitest, co-located `*.test.ts` next to the file under test. Integration suites in `__tests__/integration/` hit a **real MySQL** (never mock the DB — see `feedback_integration_tests` memory). Run via `npm --workspace @cliptale/api run test`.
- **Smoke tests:** `__tests__/smoke/` — live external calls (fal.ai). Gated; read README before running.
- **Fixtures:** co-located `*.fixtures.ts` (e.g. `aiGeneration.service.fixtures.ts`, `render.service.fixtures.ts`) supply DB seed rows and payload builders.
- **Migration tests:** `migration-NNN.test.ts` — each new migration ships with an integration test that asserts the up-state schema shape.

---

## Data Models (returned to FE)

| Shape | Source | Notes |
|---|---|---|
| `ProjectDoc` | `@ai-video-editor/project-schema` | Full timeline document |
| `AssetApiResponse` | `asset.response.service.ts` | FE-facing asset shape with derived URLs |
| `RenderJob` / `RenderJobSummary` | `render.repository.ts` | FE polling + list |
| `AiJobStatus` | `aiGenerationJob.repository.ts` | `queued`/`processing`/`done`/`failed` |
| `UserVoice` | `voice.repository.ts` | ElevenLabs per-user voice |
| `RenderPreset` | `@ai-video-editor/project-schema` + `ALLOWED_PRESETS` | 6 presets |

---

## External Dependencies

| Package | Used for |
|---|---|
| `express`, `helmet`, `cors`, `express-rate-limit` | HTTP |
| `mysql2` | DB (raw SQL) |
| `bullmq`, `ioredis` | Queues |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | S3 uploads/downloads/stream proxy |
| `bcryptjs` | Password hashing (cost 12) |
| `jsonwebtoken` | Reserved for OAuth token signing |
| `sanitize-html` | Defensive sanitization |
| `zod` | All input validation + env parsing |

---

## Cross-Domain Links

- **Uses contracts from:** `packages/api-contracts` (AI catalog, OpenAPI), `packages/project-schema` (ProjectDoc, job payloads, render presets)
- **Enqueues to:** `apps/media-worker`, `apps/render-worker`
- **Called by:** `apps/web-editor/src/lib/api-client.ts` (fetch wrapper) and all `features/*` hooks

---

## Agent Instructions

**New endpoint checklist:**
1. Register route in `routes/<domain>.routes.ts` (order matters — literal paths like `/available` before `/:id` patterns, see `aiGeneration.routes.ts` comment).
2. Controller in `controllers/<domain>.controller.ts` — export a Zod `*Schema` alongside the handler for `validateBody`.
3. Service in `services/<domain>.service.ts` — throw from `lib/errors.ts`, never touch `req/res`.
4. Repository in `repositories/<domain>.repository.ts` — import `pool`, write parameterized SQL, return typed rows.
5. Mount the router in `src/index.ts` (the 8 existing ones are listed at the top).
6. Co-located `*.service.test.ts` for unit + `__tests__/integration/<name>.test.ts` for full HTTP path.

**New background job type:**
1. Add payload type in `packages/project-schema/src/types/job-payloads.ts`.
2. Add queue constant + `new Queue(...)` in `queues/bullmq.ts`.
3. Add producer in `queues/jobs/enqueue-<name>.ts` — import `connection` from `bullmq.ts`.
4. Consumer lives in media-worker or render-worker — see their roadmaps (blocks 4 / inline).

**Adding an AI model:** Extend `FAL_MODELS` / `ELEVENLABS_MODELS` in `packages/api-contracts`. Web-editor picks it up automatically via `/ai/models`. Add a matching branch in `falOptions.validator` if it introduces novel option shapes, and ensure the worker handler supports the new `capability` group.

**Error contract:** Never `res.status(500)` from a service. Throw a typed error; the handler in `index.ts` maps it. Unknown errors → `console.error('[api] Unhandled error:', err)` + generic 500 (no detail leak).

**ACL flag:** `aclMiddleware('viewer')` for reads, `aclMiddleware('editor')` for writes. Order: `authMiddleware` before `aclMiddleware` (ACL reads `req.user`).

**High-frequency writes:** See `PATCH /projects/:id/clips/:clipId` for the pattern — custom per-project `express-rate-limit` with `keyGenerator`, no version snapshot, minimal SQL.

**Dev bypass:** Set `APP_DEV_AUTH_BYPASS=true` in compose; `auth.middleware` then attaches `dev-user-001`. Works only if `011_seed_dev_user.sql` has run.
