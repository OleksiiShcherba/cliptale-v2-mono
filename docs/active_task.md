# Active Task

## Task
**Name:** EPIC 1 — Asset Manager & Upload Pipeline
**Source:** `docs/general_tasks.md`
**Goal:** Users can upload video/audio/image assets to a project via presigned URLs, have them ingested by a media worker (metadata extraction, thumbnail, waveform), and browse/manage them in the editor sidebar — all with correct status lifecycle (`pending → processing → ready`).

---

## Context

### Why this task matters
This epic is the foundational data pipeline that unblocks every other epic. Without assets in the system, the Remotion Player preview has nothing to render, AI captions have no source media, and the render pipeline has no input. It is rated a 🟢 Quick Win because the presigned-URL upload pattern and BullMQ job queue are well-defined, even though the codebase is currently greenfield. The fastest path to a working loop is: upload asset → preview it in the Player → add captions → export.

### Relevant architecture constraints
- All API business logic lives in `apps/api/src/services/asset.service.ts` — never in routes or controllers
- Repositories (`asset.repository.ts`) contain SQL only — no domain logic
- Assets are never routed through the API server — presigned PUT URLs go directly to S3/R2
- BullMQ queues and worker registration are in `apps/api/src/queues/bullmq.ts` (enqueue side) and `apps/media-worker/src/index.ts` (consume side)
- All TypeScript must be strict-mode; no plain `.js` files
- `config.ts` in each app is the only file allowed to read `process.env` / `import.meta.env`
- DB connections are only created in `apps/api/src/db/connection.ts`
- Migrations are numbered SQL files under `apps/api/src/db/migrations/`

### Related areas of the codebase
- `apps/api/src/routes/assets.routes.ts` — route registration for upload-url + finalize endpoints (does not exist yet)
- `apps/api/src/controllers/assets.controller.ts` — request parsing, calls service (does not exist yet)
- `apps/api/src/services/asset.service.ts` — presigned URL generation, finalization logic (does not exist yet)
- `apps/api/src/repositories/asset.repository.ts` — SQL for `project_assets_current` (does not exist yet)
- `apps/api/src/queues/jobs/enqueue-ingest.ts` — typed BullMQ enqueue helper (does not exist yet)
- `apps/api/src/db/migrations/` — SQL migration for `project_assets_current` table (does not exist yet)
- `apps/media-worker/src/jobs/ingest.job.ts` — FFprobe + thumbnail + waveform job handler (does not exist yet)
- `apps/web-editor/src/features/asset-manager/` — AssetBrowserPanel, UploadDropzone, AssetCard, hooks (does not exist yet)

---

## Subtasks

- [x] **1. Scaffold monorepo structure** ✅ _done — see development_logs.md 2026-03-29_

- [x] **2. DB migration — `project_assets_current` table** ✅ _done — see development_logs.md 2026-03-30_

- [ ] **3. Redis + BullMQ infrastructure setup** ⚠️
  - What: Add Redis to the local dev environment (Docker Compose service), configure the BullMQ `Queue` and `Worker` connection in `apps/api/src/queues/bullmq.ts`, and wire the `media-worker` app entry point (`apps/media-worker/src/index.ts`) to register its worker against the same Redis instance
  - Where: `docker-compose.yml`, `apps/api/src/queues/bullmq.ts`, `apps/media-worker/src/index.ts`, `.env.example`
  - Why: The finalization endpoint enqueues a `media-ingest` job — Redis must be reachable before that endpoint can be tested end-to-end; this is the highest-risk infra dependency and should be spiked on day 1
  - Depends on: subtask 1 ✅

- [ ] **4. [BE] Presigned URL endpoint**
  - What: Implement `POST /projects/:id/assets/upload-url` — route → controller → `asset.service.ts` (validates content type, generates presigned PUT URL via S3/R2 SDK, calls repository to insert `pending` row) → `asset.repository.ts` (INSERT SQL)
  - Where: `apps/api/src/routes/assets.routes.ts`, `apps/api/src/controllers/assets.controller.ts`, `apps/api/src/services/asset.service.ts`, `apps/api/src/repositories/asset.repository.ts`
  - Why: This is the entry point of the upload pipeline; unblocks the finalization endpoint and the FE upload flow
  - Depends on: subtasks 2, 3

- [ ] **5. [BE] Asset finalization + ingest enqueue endpoint**
  - What: Implement `POST /assets/:id/finalize` — verifies object exists in storage (HEAD request in service layer), transitions status `pending → processing`, enqueues `media-ingest` BullMQ job via `enqueue-ingest.ts` helper; idempotency guard (no duplicate jobs if already processing/ready)
  - Where: `apps/api/src/routes/assets.routes.ts`, `apps/api/src/controllers/assets.controller.ts`, `apps/api/src/services/asset.service.ts`, `apps/api/src/repositories/asset.repository.ts`, `apps/api/src/queues/jobs/enqueue-ingest.ts`
  - Why: Closes the upload loop — client calls this after the XHR PUT completes, triggering background processing
  - Depends on: subtask 4

- [ ] **6. [BE/INFRA] Media worker — `media-ingest` job handler** ⚠️
  - What: Implement the BullMQ job handler in `apps/media-worker/src/jobs/ingest.job.ts` — download asset from storage, run FFprobe to extract `durationFrames/width/height/fps`, generate 320×180 JPEG thumbnail (first frame via FFmpeg), generate downsampled waveform peaks JSON for audio/video, upload thumbnail to storage, update `project_assets_current` row to `ready`; on failure set status `error` with message; retry up to 3× with exponential backoff
  - Where: `apps/media-worker/src/jobs/ingest.job.ts`, `apps/media-worker/src/index.ts`
  - Why: Without this, assets are stuck in `processing` forever and the FE browser panel never shows them as ready
  - Depends on: subtask 5 (schema defined), subtask 3 (BullMQ wired); requires FFprobe + FFmpeg binaries in container ⚠️

- [ ] **7. [FE] Asset browser panel + upload UI**
  - What: Build `apps/web-editor/src/features/asset-manager/` — `AssetBrowserPanel` (grouped list by type with thumbnail cards), `UploadDropzone` (drag-and-drop + file picker), `useAssetUpload` hook (presigned URL flow + XHR progress), `useAssetPolling` hook (2 s poll on `/assets/:id` until `ready`), detail popover (duration, resolution, size), empty state, error toasts
  - Where: `apps/web-editor/src/features/asset-manager/components/`, `hooks/`, `api.ts`, `types.ts`
  - Why: This is the user-facing surface of the entire epic — visible proof that the pipeline works
  - Depends on: subtasks 4 + 5 live or mocked; FE development can start against mock stubs in parallel

---

## Open Questions / Blockers

1. ⚠️ **Redis availability in dev** — Addressed in subtask 1 (Docker Compose), but full wiring of BullMQ connection config is subtask 3.
2. ⚠️ **FFmpeg/FFprobe in `media-worker` container** — Must be installed in the Docker image or available in PATH. Confirm base image (e.g. `node:20-alpine` + `apk add ffmpeg`) before starting subtask 6.
3. ⚠️ **S3/R2 credentials + bucket config** — Added to `.env.example` in subtask 1. Actual values needed before subtask 4 can be tested end-to-end.
4. **File size limit** — No max size specified. Needs a product decision (suggested: 2 GB for video, 200 MB for audio/image).
5. **Asset GET endpoint** — The FE polling hook (`useAssetPolling`) needs a `GET /assets/:id` endpoint. Add it as part of subtask 4 or treat it as a thin addition to the finalization ticket.

---

## Notes for the implementing agent

- **Layering is strictly enforced**: routes call controllers, controllers call services, services call repositories. Do not skip layers. See `docs/architecture-rules.md` §4 and §5.
- `apps/api/src/config.ts` is the **only** file that may read `process.env`. Pass config values as constructor args or function parameters everywhere else.
- The BullMQ job payload type for `media-ingest` should be defined in `packages/project-schema/` or locally in `apps/api/src/queues/jobs/enqueue-ingest.ts` and imported by the worker — never duplicated.
- `useAssetUpload` uses native XHR (not `fetch`) so that `onprogress` events fire during the PUT to S3/R2. `fetch` does not expose upload progress in browsers today.
- The FE polling interval (2 s) should be implemented with `useInterval` or a `useEffect` cleanup pattern — never `setInterval` without cleanup.
- Presigned URL expiry is 15 minutes. The client should check `expiresAt` before using a cached URL and re-request if expired.
- Idempotency on `POST /assets/:id/finalize`: check if a BullMQ job for this `assetId` already exists (use `Queue.getJob(assetId)`) before enqueuing a duplicate.

---

## Design

### Design Required: Yes (Subtask 7 — FE Asset Browser Panel + Upload UI)

Subtasks 1–6 are backend/infra only and have no UI impact. Subtask 7 is entirely UI work and is covered by the existing Figma designs below.

---

### Figma File
- **File:** ClipTale v2
- **File Key:** `KwzjofZgWKvEQuz9bXzEYT`
- **Page:** Asset Management (`1:6`)

### Relevant Frames

| Frame Name | Breakpoint | Node ID | Description |
|------------|------------|---------|-------------|
| Asset Browser | Desktop | `15:2` | Full editor layout: left asset panel (320px) + right detail panel (280px) |
| Upload Modal | Desktop | `15:81` | Centered modal 520×580px with drag-zone + per-file progress bars |
| Upload Modal | Mobile | `15:103` | Bottom sheet sliding up from bottom with same content as modal |

### Component Inventory (from Figma)

| Region | Node ID | Dimensions | Key Details |
|--------|---------|------------|-------------|
| **ASSET BROWSER PANEL (EXPANDED)** | `15:5` | 320×852px, `surface-alt` bg | Left sidebar of editor |
| ↳ PANEL TABS — All/Video/Audio/Image | `15:7` | 320×40px, `surface-elevated` bg | Filter tabs at top of panel |
| ↳ SEARCH BAR | `15:9` | 296×36px, `border` outline, `radius-sm` | Search field inside panel |
| ↳ FILTER ROW | `15:11` | 296×32px, `surface-elevated` bg | Secondary filter controls |
| ↳ ASSET ITEM (×8) | `15:13`–`15:55` | 296×64px, `surface-elevated` bg, `radius-md` | Each: 48×48px THUMB + META block |
| ↳ UPLOAD BUTTON | `15:61` | 296×40px, `primary` bg, `radius-md` | Pinned to bottom of panel |
| **ASSET DETAIL PANEL** | `15:67` | 280×620px, `surface-alt` bg | Right sidebar, shown on asset select |
| ↳ ASSET PREVIEW THUMBNAIL / WAVEFORM | `15:69` | 248×160px, `surface-elevated` bg, `radius-md` | Video thumbnail or audio waveform |
| ↳ FILENAME | `15:71` | 248×32px, `surface-elevated` bg | Editable or display filename |
| ↳ FILE TYPE + SIZE + DURATION | `15:73` | 248×40px, `surface-elevated` bg | Metadata row |
| ↳ STATUS READY badge | `15:75` | 140×28px, `success` bg, `radius-full` | Green pill — also needs `processing`/`error` variants |
| ↳ REPLACE FILE BUTTON | `15:77` | 248×36px, `border` outline, `radius-md` | Secondary action |
| ↳ DELETE ASSET BUTTON | `15:79` | 248×36px, `border` outline, `radius-md` | Destructive secondary action |
| **UPLOAD MODAL CONTAINER** (Desktop) | `15:83` | 520×580px, `surface-elevated` bg, `radius-lg` | Centered modal |
| ↳ MODAL HEADER — Upload Assets | `15:85` | 472×40px, `surface-alt` bg | Title + close button |
| ↳ DRAG AND DROP ZONE | `15:87` | 472×200px, `border` dashed outline, `radius-lg` | Drop target area |
| ↳ UPLOAD ICON + INSTRUCTION TEXT | `15:89` | 200×72px | Icon + "Drop files here or browse" |
| ↳ OR DIVIDER | `15:91` | 128×24px, `radius-full` | Horizontal divider pill |
| ↳ BROWSE FILES BUTTON | `15:93` | 168×40px, `primary` bg, `radius-md` | Opens file picker |
| ↳ FILE ROW (uploading) | `15:95` | 472×48px, `surface-alt` bg | Filename + % label |
| ↳ PROGRESS BAR | `15:97` | variable×6px, `primary` bg, `radius-full` | Upload progress indicator |
| ↳ FILE ROW (queued) | `15:99` | 472×48px, `surface-alt` bg | Queued state |
| ↳ MODAL FOOTER — Close / Done | `15:101` | 472×48px, `surface-alt` bg | Cancel + Done actions |
| **UPLOAD BOTTOM SHEET** (Mobile) | `15:106` | 390×544px, `surface-elevated` bg | Slides up from bottom |
| ↳ SHEET HANDLE | `15:108` | 80×4px, `border` bg, `radius-full` | Drag indicator at top |
| ↳ DRAG AND DROP TAP ZONE | `15:112` | 358×160px, `border` outline | Tap-to-browse on mobile |
| ↳ BROWSE FILES BUTTON (mobile) | `15:114` | 358×44px, `primary` bg | Full-width on mobile |
| ↳ DONE BUTTON (mobile) | `15:122` | 358×48px, `primary` bg | Full-width CTA |

### Design Notes for Developer Agent

1. **Asset item row structure** — Each `AssetCard` is 296×64px with a 48×48px thumbnail on the left (`radius-sm`, `surface-alt` bg as placeholder) and a META block (filename + status badge) to the right. Vertical gap between items is `space-2` (8px); items start at y=140 with 12px panel padding.

2. **Status badge variants** — The Figma only shows `STATUS READY` (`#10B981` / `success`, `radius-full`, 140×28px). Implement three variants:
   - `ready` → `success` (#10B981) green pill
   - `processing` → `warning` (#F59E0B) amber pill
   - `error` → `error` (#EF4444) red pill
   - `pending` → `text-secondary` (#8A8AA0) grey pill

3. **Upload progress bar** — 6px tall, `primary` (#7C3AED) fill, `radius-full`, width is dynamic (percentage of 472px desktop / 358px mobile container). Sits directly below the file row.

4. **Panel pinning** — Upload button (`15:61`) is pinned to y=808 inside the 852px-tall panel, meaning it sits 4px from the bottom. Implement as `position: sticky; bottom: 0` or flex column with `mt-auto`.

5. **Detail panel** — Only visible when an asset is selected. Replace/Delete buttons are at y=508 and y=560 (bottom of the 620px panel). Spacer between metadata and buttons should stretch to fill.

6. **Drag-and-drop zone active state** — Not in Figma; use `primary-light` (#4C1D95) tinted background + `primary` border when dragging over.

7. **Modal vs bottom sheet** — Same component, different presentation. Desktop: centered `position: fixed` overlay with `backdrop-filter: blur(12px)`. Mobile (`< 768px`): full-width bottom sheet sliding up, `border-radius: radius-lg radius-lg 0 0`.

8. **Spacing baseline** — All internal padding uses multiples of 4px. Panel item padding is 12px (`space-3`) from panel edge. Card internal padding is 8px (`space-2`).

9. **Empty state** — Not in Figma. Use `text-secondary` body-sm copy + upload icon, centered in the panel list area.

10. **Polling spinner** — Not in Figma. While status is `processing`, show a subtle spinner or pulsing `warning` pill in the AssetCard META area.

### How to Query Figma via MCP

```
File key: KwzjofZgWKvEQuz9bXzEYT

Asset Browser Desktop:   get node 15:2
Asset Detail Panel:      get node 15:67
Upload Modal Desktop:    get node 15:81
Upload Modal Mobile:     get node 15:103
```

---

_Design section added by task-design-sync skill — 2026-03-29_

---
_Generated by task-planner skill — 2026-03-28_

**Status: Ready For Use By task-executor**