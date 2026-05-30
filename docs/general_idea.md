# General Idea — Remotion-Based AI Video Editor (compacted)

> Compacted for token efficiency. Full uncompacted copy: `docs/general_idea.full.md`.
> Confirmed decisions: **monorepo** (`apps/` + `packages/`), **MySQL/InnoDB** primary DB, **snapshot-per-update** document versioning.

## Core stance
- Browser edits a typed **project document** and drives a **Remotion Player** preview; heavy work (ingest, AI generation, final renders) runs async in workers.
- Dual-mode rendering layer: **preview-time** (React Player, browser tags) vs **render-time** (SSR `@remotion/renderer`, FFmpeg-backed `<OffthreadVideo>`).
- TypeScript required. Same project-document types compile in browser, API, and render workers.

## Monorepo layout (`apps/` + `packages/`, Turborepo internal-packages model)
| Location | Purpose |
|---|---|
| `apps/web-editor/` | Timeline UI, inspector, Remotion Player preview, asset browser |
| `apps/api/` | Auth, ACLs, project CRUD, presigned URL issuance, job submission, webhooks |
| `apps/render-worker/` | Remotion SSR rendering via `@remotion/renderer` → final media |
| `apps/media-worker/` | Ingest: metadata extraction, waveform/thumb/proxy generation |
| `packages/project-schema/` | TS types + runtime validation + migrations |
| `packages/editor-core/` | Timeline engine, snapping, selection, commands, patch generation |
| `packages/remotion-comps/` | Compositions as pure render targets (typed input props) |
| `packages/api-contracts/` | OpenAPI + generated TS types/clients |
| `packages/ui/` | Reusable components + Storybook |
- Keep Remotion versions aligned across `remotion` and `@remotion/*` packages.

## MySQL persistence — snapshot-per-update versioning
- Rollback is an app-level history mechanism; no DB switch needed. InnoDB gives ACID transactions + row-level locking for atomic multi-step writes.
- MySQL native `JSON` validates on insert. **JSON columns are not directly indexable** → index extracted scalars via generated columns / expression indexes, or keep relational lookup tables.
- Hybrid pattern: immutable snapshots + latest pointer + materialized current-state tables + audit log → history *and* fast reads.

### Schema (see full doc for complete DDL)
- **`projects`** — stable identity. `project_id` CHAR(26) PK (ULID), `owner_user_id`, `latest_version_id` (fast-load pointer), `visibility` ENUM(private/unlisted/public), `public_slug` UNIQUE, timestamps.
- **`project_versions`** — immutable snapshot-per-update. `version_id` BIGINT PK AI, `project_id`, `parent_version_id`, `doc_json` JSON (full snapshot), plus metadata cols (`doc_schema_version`, `duration_frames`, `fps`, `width`, `height`). Indexed `(project_id, created_at)`.
- **`project_version_patches`** — Immer forward/inverse patch arrays as JSON for fast undo/redo + diffs.
- **Materialized current tables** (transactionally updated at version write):
  - `project_assets_current` *(superseded by `files` — see Evolution)*
  - `project_tracks_current` — track_type ENUM(video/audio/overlay/effects), sort_order, muted/locked.
  - `project_clips_current` — clip_id, track_id, asset_id, start_frame, duration_frames, trim_in/out, layer (z-order), clip_json. Indexed `(project_id, start_frame)`, `(project_id, track_id, start_frame)`, `(project_id, asset_id)`.
- **`project_audit_log`** — append-only security/trace log (actor, event_type, event_json, indexed by time + event_type).

### Query patterns
- Load fast: `projects.latest_version_id` → fetch `doc_json` (or hydrate from `*_current`).
- Timeline viewport: `project_clips_current` by `(project_id, start_frame)`.
- Asset browser: `project_assets_current WHERE project_id ORDER BY asset_type`.
- Querying inside JSON requires generated columns / functional indexes.

## Remotion integration
- Compositions centralized in `packages/remotion-comps/`: `Root.tsx`, composition components accepting typed `inputProps`, clip renderers (Video/Image/Audio/TextOverlay). Input props must be JSON-serializable → matches JSON snapshots.
- **Preview (`<Player>`)**: regular React app; **memoize `inputProps`** to avoid whole-tree re-renders.
- **Render (SSR/Lambda)**: 3-step flow bundle → select composition → `renderMedia()`.
- **Media tags**: `<OffthreadVideo>` (FFmpeg frame extraction) is **not supported client-side** → use `<Video>` from `@remotion/media` for preview. Switch via `useRemotionEnvironment()` (`env.isRendering`).
- **Scale path**: Phase A render-worker containers (`renderMedia()`) → Phase B add Remotion Lambda for bursts (`framesPerLambda`/`concurrency`, `getRenderProgress()`) → Phase C hybrid routing (small→worker, large→Lambda). Lambda runs in your own AWS account as a "scale valve."

## Document model: assets / tracks / clips
- **Asset**: reusable media resource (uploaded or AI-generated), exists independently of timeline.
- **Track**: timeline lane/grouping; defines defaults (type/muted/locked); spans full project, not time-bounded.
- **Clip**: time-bounded placement of an asset on a track (start/duration, trim, transforms, keyframes, overrides). One asset → many clips. `layer` is the deterministic tie-breaker for same-type overlaps.
- Snapshot JSON shape: `{schemaVersion, projectId, video{fps,width,height,durationFrames}, assets[], tracks[], clips[], sharing{visibility,publicSlug}}` (concrete example in full doc).

## Editor state — three layers
| Layer | Examples | Frequency | Storage |
|---|---|---|---|
| Persistent project doc | assets/tracks/clips, share/render settings | Medium (debounced saves) | MySQL snapshots + current tables |
| Ephemeral UI | selection, drag, hover, panels, zoom/scroll, playback | Very high | External in-memory store |
| Derived/cached | clip geometry, snapping, waveforms, proxy URLs, flattened sequences | High (computed) | RAM + optional Redis |
- Keeping "what is saved" separate from "UI only" reduces bugs and clarifies AI-agent contributions.

## State mgmt, TypeScript, undo/redo
- **TypeScript required.** Global state via **external store + `useSyncExternalStore`** (granular per-slice subscriptions avoid whole-tree rerenders during scrub/drag).
- Store choice: **Redux Toolkit** (strong conventions, many contributors) vs **lightweight/Zustand-like** (max performance control). Pick RTK for action discipline; lightweight when scrub/drag perf is the constraint.
- **Undo/redo via Immer patches**: `produceWithPatches` → `[result, patches, inversePatches]`; apply with `applyPatches()`. Store forward/inverse patches in `project_version_patches` → instant in-session undo + server-side diffs/auditability + replay later.
- **Persist update sequence**: read latest_version_id (parent) → insert `project_versions` snapshot → insert patches → update `latest_version_id` → update `*_current` tables — all in one InnoDB transaction.
- **Rollback**: switch `latest_version_id` to target + re-materialize `*_current` from that snapshot.

## Timeline UI performance
- **Virtualize** with `react-window` (track rows, clip rows, asset grids); tune `overscanCount`.
- **rAF-driven playhead**: update pixel position as CSS transform in a `requestAnimationFrame` loop; commit authoritative playhead frame to state only occasionally (pause/seek end).
- **Memoize** all props passed to Remotion Player (`useMemo`, immutable snapshots/stable derived objects) to avoid cascaded rerenders.

## Assets, storage, queues, monitoring
- **Uploads**: direct-to-object-storage via signed/presigned URLs. Client requests URL from API → uploads directly → notifies API to finalize + enqueue ingest. Supported by S3 / GCS / R2. Presigned URLs stop working if signing creds are revoked.
- **Job queues**: **BullMQ** (Redis-backed; short/medium jobs, retries, rate limits — simplest ops) vs **Temporal** (durable Event History + replay; long multi-step AI pipelines, human-in-loop). Pick BullMQ for fire-and-forget+retries, Temporal for durable orchestration.
- **Monitoring**: Lambda progress via `getRenderProgress()` / `renderMediaOnLambda()`; `framesPerLambda >= 4`, max concurrency 200. Use a shared "job table + progress polling" API shape so render execution can migrate behind one interface.

## Security, sharing, CI / AI-agent friendliness
- Treat project visibility and asset visibility independently. Signed URLs for private assets/outputs; never make raw buckets public. Presigned expiration/revocation is part of the threat model.
- Follow OWASP cheat sheets (auth, session, logging). Keep append-only `project_audit_log` + job event logs.
- **Explicit contracts + reproducible sandboxes** for AI-agent friendliness: OpenAPI contracts; Storybook (isolated UI states); Playwright (cross-browser E2E); ESLint + Prettier + TypeScript in CI.
- Keep LLM prompts/skills in-repo: `docs/ai/remotion-system-prompt.txt`, `docs/ai/architecture-rules.md`, `docs/ai/api-openapi.md`.

---

## Evolution since 2026-03-29
> Decisions made after the original vision. Guardian reviews anchor on this section; earlier sections are historical record.

### Storyboard drafts
- Video-generation wizard uses a persistent draft document between steps. Migration `019_generation_drafts.sql` creates **`generation_drafts`**: one row per `user_id`, `prompt_doc` JSON (PromptDoc built through wizard Steps 1-3), `status` `draft → step2 → step3 → completed`.
- Wizard-session files link to the draft via **`draft_files`** pivot (`022_file_pivots.sql`).
- Home page renders in-progress draft as a storyboard-card (sibling to project cards) via `GET /generation-drafts` in `apps/web-editor/src/features/home/`.

### Files-as-Root
- **`project_assets_current` is superseded.** The **`files`** table (`021_files.sql`) is the single user-scoped root for every blob (uploads, AI outputs, future kinds). A `files` row is owned by `user_id`, independent of any project/draft.
- Container membership via two pivots (`022_file_pivots.sql`):
  - **`project_files (project_id, file_id)`** — `ON DELETE CASCADE` project-side, `ON DELETE RESTRICT` file-side.
  - **`draft_files (draft_id, file_id)`** — same semantics, scoped to a draft.
- Transition migrations:
  | Migration | Effect |
  |---|---|
  | `023` | Adds nullable `file_id` to `project_clips_current`, `caption_tracks`; `output_file_id` to `ai_generation_jobs`. |
  | `024` | Backfills `file_id` from `asset_id`; seeds `files` + `project_files` from old `project_assets_current`. |
  | `025` | Drops legacy `project_id` from `ai_generation_jobs`. |
  | `026` | Adds `draft_id` to `ai_generation_jobs` so completion handler auto-links `output_file_id` into `draft_files`. |
- `asset_id` renamed to `file_id` throughout on-disk schema. Wire-level DTO rename (`assetId → fileId`) applied across `packages/api-contracts/src/openapi.ts`, `apps/api/src/controllers/clips.controller.ts`, and consuming `apps/web-editor/src/**` (Guardian Batch-2 cleanup, 2026-04-19).

### `features/` vs `shared/` split
- `apps/web-editor/src/` partitioned into `features/` (single-consumer) and `shared/` (cross-feature).
- **Rule: a module consumed by 2+ features belongs in `shared/`.**
- `ai-generation` moved to `apps/web-editor/src/shared/ai-generation/` because both `features/generate-wizard/` and `features/timeline/` invoke it. A module gaining a second consumer must migrate to `shared/` in the same PR (prevents circular imports).

### In-process migration runner
- Old approach (mounting `migrations/` into MySQL via `docker-entrypoint-initdb.d`) is fragile — only fires on a fresh volume, so later migrations silently never ran.
- Sanctioned path: **`apps/api/src/db/migrate.ts`**, imported by `apps/api/src/index.ts`, runs before `app.listen()`. Queries `schema_migrations` (`000_schema_migrations.sql`) for unapplied migrations, executes in filename order. MySQL 8.0 DDL is non-transactional → a migration is recorded in `schema_migrations` only after its SQL succeeds; a mid-migration crash leaves no row, so it re-attempts on next boot.
- Remove the `docker-entrypoint-initdb.d` volume mount from `docker-compose.yml` for all environments once the in-process runner is confirmed stable. Do **not** re-introduce the mount for new migrations.
