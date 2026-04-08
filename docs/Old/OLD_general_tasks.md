# AI Video Editor Web App — Market Research & Epic Breakdown
> Based on the Remotion + React + Node.js monorepo architecture

---

## Part 1: Market Research

### Business Idea Summary

A **web-based AI video editor** powered by Remotion — letting users compose, preview, and export videos through a timeline UI. The product differentiates by being **developer-grade underneath** (typed project documents, programmatic rendering via Remotion) while offering an accessible UX to non-technical creators. It sits at the intersection of collaborative editing tools (Canva/Kapwing) and programmatic video platforms (Remotion/Revid).

---

### Competitor Landscape

| Competitor | Key Features | Strengths | Weaknesses |
|---|---|---|---|
| **CapCut** (ByteDance) | Timeline editor, AI captions, templates, voice isolation, text-to-video | 200M+ MAU, cross-platform (web/mobile/desktop), aggressive freemium | US ban risk, ByteDance data concerns, generic output, TOS grants them perpetual content license |
| **Canva Video** | Drag-and-drop, AI video gen, auto-captions, brand kit, scheduling | World's largest design user base, strong brand tooling, seamless asset reuse | Not a real NLE; timeline is shallow; heavy on templates, weak on precision editing |
| **Kapwing** | Browser-based, real-time team collaboration, templates, AI tools | Strong collaboration story, no account needed to start | No mobile app, watermark on free tier, limited AI depth vs newer tools |
| **InVideo AI** | Text-to-video, AI scripts, 8M+ stock library, 3 aspect ratios | $1M ARR benchmarks in short time, fast content pipeline | Limited aspect ratios, AI output quality inconsistent |
| **VEED.io** | Recording, captions, subtitles, AI studio, brand templates | Multi-language support, recording + editing in one | AI clips less detailed than competitors; recording insufficient for pro teams |
| **Runway** | Gen-4 video model, multi-shot, audio gen, professional VFX | Best-in-class generative video quality; used by pro filmmakers | Very expensive; not a general editing platform |
| **OpusClip** | AI clip extraction from long video, subject tracking, B-roll gen | Repurposing niche well-owned; prompt-based editing is unique | Focused narrowly on repurposing; not a full editor |
| **DaVinci Resolve** | Full NLE, color grading, audio mixing, AI tools | Most powerful free pro editor; constant AI updates | Steep learning curve; desktop-only; overkill for most creators |
| **Clipchamp** (Microsoft) | Browser-based, free 1080p watermark-free exports, OneDrive integration | Excellent free tier; Microsoft 365 ecosystem lock-in | Shallow NLE; limited AI depth; no real programmatic layer |
| **Typeframes** (Remotion-based) | Product intro videos from text, SaaS-specific templates | Built on Remotion, fast to MVP, strong PLG (watermark free tier) | Narrow niche (SaaS product intros), not a full editor |

**Key market insight:** The CapCut exodus (US ban + ToS concerns) has left a gap for a privacy-respecting, web-based editor with genuine AI depth. Tools that combine **timeline precision + AI generation + programmatic rendering** don't yet exist in a single well-executed product. Remotion's success stories (Submagic, Typeframes, AIVideo.com hitting $1M ARR) confirm the tech is production-validated.

---

### Feature Ideation

#### 🎛 Core Editing
1. **Timeline editor with multi-track clips** — Drag, trim, split, layer video/audio/overlay clips on a virtual timeline
2. **Real-time Remotion Player preview** — In-browser preview synchronized to the project document, memoized for scrub performance
3. **Asset manager with upload + ingest pipeline** — Upload via presigned URLs, auto-generate waveforms/thumbnails/proxy

#### 🤖 AI Generation
4. **AI captions / auto-subtitles** — Whisper-powered transcription with editable caption track on the timeline
5. **Text-to-video clip generation** — Generate b-roll or intro clips from a prompt (integrates with Runway/Kling/Veo APIs)
6. **AI audio generation** — Generate background music or SFX from a text prompt (ElevenLabs/Suno-style)
7. **Smart clip trimmer** — AI detects silences, filler words, dead air; auto-creates edit points on the timeline

#### 🔗 Collaboration & Sharing
8. **Project version history + rollback** — Snapshot-per-update with one-click restore (already in architecture)
9. **Shareable preview links** — Unlisted/public slugs for stakeholder review without account required
10. **Team workspaces** — Invite collaborators with role-based permissions (owner/editor/viewer)

#### 🚀 Export & Delivery
11. **Background render pipeline** — Queue-based export to MP4/WebM via Remotion SSR; progress tracking
12. **Render presets** — 1080p, 4K, vertical (9:16), square (1:1), custom — mapped to Remotion composition props
13. **Direct publish to social** — Post to YouTube / TikTok / Instagram directly from the export modal

#### 💡 Growth / Delight
14. **Project templates** — Starter compositions (product demo, explainer, social ad) with replaceable slots
15. **Brand kit** — Save fonts, colors, logos — auto-applied to new compositions and text overlays

---

### Prioritization Matrix

| Feature | Value (1–5) | Effort (1–5) | Priority Tier | Rationale |
|---|---|---|---|---|
| Timeline editor (multi-track) | 5 | 5 | 🔵 Strategic Bet | Core product identity; high effort but non-negotiable |
| Remotion Player preview | 5 | 3 | 🟢 Quick Win | Remotion Player drops in; architecture already designed for this |
| Asset manager + upload | 5 | 3 | 🟢 Quick Win | Presigned URL pattern is well-defined; unblocks everything |
| AI captions / subtitles | 5 | 3 | 🟢 Quick Win | Whisper API is mature; high user demand; strong differentiation from Clipchamp |
| Background render pipeline | 5 | 4 | 🔵 Strategic Bet | Required for usability; BullMQ + Remotion SSR is clear path |
| Render presets | 4 | 2 | 🟢 Quick Win | Maps to Remotion inputProps; almost free once render pipeline exists |
| Version history + rollback | 4 | 2 | 🟢 Quick Win | Schema already designed; massive trust/safety signal for users |
| Shareable preview links | 4 | 2 | 🟢 Quick Win | Public slug pattern already in schema |
| Smart clip trimmer (AI) | 4 | 4 | 🔵 Strategic Bet | Silence detection via FFmpeg + AI; real differentiation vs CapCut |
| Text-to-video generation | 4 | 4 | 🔵 Strategic Bet | Requires external model API integration + async job handling |
| Project templates | 3 | 2 | 🟡 Fill-in | Nice onboarding lift; low effort once compositions exist |
| Brand kit | 3 | 3 | 🟡 Fill-in | Valuable for teams; can ship incrementally |
| Team workspaces | 3 | 4 | 🔵 Strategic Bet | Needed for B2B; defer until single-user flow is stable |
| AI audio generation | 3 | 3 | 🟡 Fill-in | Useful but not core to editing workflow |
| Direct social publish | 2 | 4 | 🔴 Avoid for now | OAuth per platform + API rate limits + compliance overhead |

---

### Recommended Roadmap

**Phase 1 — MVP (Next Sprint)**
Quick Wins: Asset manager, Remotion Player preview, AI captions, version history, shareable links, render presets

**Phase 2 — Core Product (Next Quarter)**
Strategic Bets: Timeline editor (split into sub-epics below), background render pipeline, smart clip trimmer

**Phase 3 — Growth (Later)**
Strategic Bets: Text-to-video generation, team workspaces
Fill-ins: Brand kit, project templates, AI audio

**Strategic reasoning:** The fastest path to a usable product is: upload an asset → preview it in the Player → add AI captions → export. That creates a complete loop before the full timeline editor is polished. The timeline is the most complex surface and should be parallelized with backend work. Captions alone are a strong enough differentiator to acquire early users given the CapCut exodus and trust concerns.

---
---

## Part 2: Epic Breakdown

---

### EPIC 1 — Asset Manager & Upload Pipeline 🟢 Quick Win

**Pages / Surfaces:**
- Asset Browser panel (sidebar in the editor)
- Upload modal (drag-and-drop + file picker)
- Asset detail view (metadata, waveform/thumbnail preview)

---

**[BE] Create Asset Upload Presigned URL Endpoint**

**Description:** Build a `POST /projects/:id/assets/upload-url` endpoint that generates a presigned PUT URL to object storage (S3/R2). The endpoint validates the file type and size, creates a pending `project_assets_current` row, and returns the signed URL + asset ID to the client. This unblocks the frontend from uploading directly to storage without routing files through the API server.

**Acceptance Criteria:**
- [ ] Accepts `{ filename, contentType, fileSizeBytes }` in request body
- [ ] Validates allowed content types (`video/*`, `audio/*`, `image/*`)
- [ ] Returns `{ assetId, uploadUrl, expiresAt }` with 15-minute URL expiry
- [ ] Creates a `pending` asset row in `project_assets_current`
- [ ] Returns 400 on invalid content type, 413 on oversized file
- [ ] Auth middleware enforces user owns the project

**Dependencies:** None
**Effort:** S

---

**[BE] Asset Finalization + Ingest Job Enqueue Endpoint**

**Description:** Build a `POST /assets/:id/finalize` endpoint the client calls after upload completes. It verifies the file exists in object storage (HEAD request), transitions the asset status from `pending` to `processing`, and enqueues an ingest job via BullMQ. The ingest job extracts metadata (duration, resolution) and generates a thumbnail + waveform proxy.

**Acceptance Criteria:**
- [ ] Verifies the object exists in storage before finalizing
- [ ] Updates asset status to `processing` in DB
- [ ] Enqueues a `media-ingest` BullMQ job with `{ assetId, projectId, uri }`
- [ ] Returns 404 if asset not found or not in `pending` status
- [ ] Idempotent — repeated calls do not create duplicate jobs

**Dependencies:** Create presigned URL endpoint
**Effort:** M ⚠️ Requires BullMQ + Redis setup

---

**[BE] Media Worker — Asset Ingest Job**

**Description:** Implement the `media-ingest` BullMQ job handler in `apps/media-worker/`. It uses FFprobe to extract video/audio metadata, generates a thumbnail (first frame), and for audio/video generates a downsampled waveform JSON. Updates the asset row with extracted metadata and sets status to `ready`.

**Acceptance Criteria:**
- [ ] Extracts `durationFrames`, `width`, `height`, `fps` from video
- [ ] Generates a 320x180 JPEG thumbnail stored to object storage
- [ ] Generates waveform peak data (array of normalized floats) for audio/video assets
- [ ] Updates `project_assets_current` row to `ready` status with all extracted fields
- [ ] On failure: sets status to `error`, stores error message, retries up to 3x with exponential backoff

**Dependencies:** Asset finalization endpoint
**Effort:** M ⚠️ FFprobe/FFmpeg binary dependency in worker container

---

**[FE] Asset Browser Panel + Upload UI**

**Description:** Build the asset browser sidebar panel in `apps/web-editor/`. Shows all `ready` assets for the current project grouped by type (video/audio/image). Includes a drag-and-drop upload zone and a file picker button. Uploaded assets show a progress bar during upload + ingest, then appear in the list when `ready`. Clicking an asset selects it; dragging an asset onto the timeline creates a clip.

**Acceptance Criteria:**
- [ ] Displays assets grouped by type with thumbnail previews
- [ ] Drag-and-drop and file picker upload trigger presigned URL flow
- [ ] Upload progress shown via XHR `onprogress` event
- [ ] Asset cards show `processing` spinner until ingest completes (poll `/assets/:id` every 2s)
- [ ] Selecting an asset shows metadata in a detail popover (duration, resolution, size)
- [ ] Empty state with illustrated prompt to upload first asset
- [ ] Handles upload errors with inline toast notification

**Dependencies:** Presigned URL + finalization endpoints
**Effort:** M

---

**Summary — Epic 1**

| Ticket | Area | Effort | Depends On |
|---|---|---|---|
| Create presigned URL endpoint | BE | S | None |
| Asset finalization + ingest enqueue | BE | M | Presigned URL |
| Media worker ingest job | BE/INFRA | M | Finalization endpoint |
| Asset browser panel + upload UI | FE | M | Both BE endpoints |

**Build order:** Start BE tickets immediately. FE can begin with mocked presigned URLs and a stub status endpoint, enabling parallelization. Worker setup (Redis + BullMQ) is the biggest infra risk — spike this day 1.

---
---

### EPIC 2 — Remotion Player Preview 🟢 Quick Win

**Pages / Surfaces:**
- Preview panel (center of editor)
- Playback controls bar (play/pause/scrub/frame counter)

---

**[FE] Integrate Remotion Player with Project Document**

**Description:** Mount `<Player>` from `remotion` in the preview panel of `apps/web-editor/`. Pass the current project snapshot as `inputProps` to the composition defined in `packages/remotion-comps/`. Implement memoization of inputProps via `useMemo` to prevent full re-renders during scrubbing. Connect playhead frame to a `useSyncExternalStore` subscription so only the Player and frame counter re-render during playback.

**Acceptance Criteria:**
- [ ] Player renders the current project document composition
- [ ] Playback (play/pause/scrub) works without full component tree re-render
- [ ] `inputProps` are memoized — confirmed with React DevTools Profiler
- [ ] Player respects `video.fps`, `video.width`, `video.height` from project doc
- [ ] Player scales to fill the preview panel with letterboxing if needed
- [ ] Playhead frame synced bi-directionally with the timeline ruler

**Dependencies:** `packages/remotion-comps/` base composition exists
**Effort:** M ⚠️ Performance-sensitive; requires profiling pass

---

**[FE] Base Remotion Composition in `packages/remotion-comps/`**

**Description:** Create the root `<VideoComposition>` component in `packages/remotion-comps/` that accepts a `ProjectDoc` as input props. Renders tracks and clips in z-order. Each clip type dispatches to a typed sub-component: `<VideoLayer>` (dual-mode `<Video>` / `<OffthreadVideo>` using `useRemotionEnvironment`), `<AudioLayer>`, `<ImageLayer>`, and `<TextOverlayLayer>`. This is the shared render target used by both the Player (preview) and the render worker (SSR).

**Acceptance Criteria:**
- [ ] Renders clips at correct `startFrame` and `durationFrames`
- [ ] `<VideoLayer>` uses `<Video>` in browser, `<OffthreadVideo>` in SSR render
- [ ] Layer z-order respected per `clip.layer` field
- [ ] Audio clips render `<Audio>` with volume and fade-in/out from `clip.audio`
- [ ] TypeScript strict-mode: `inputProps` typed to `ProjectDoc` from `packages/project-schema/`
- [ ] Storybook stories cover: empty timeline, single video clip, audio + video, overlapping clips

**Dependencies:** `packages/project-schema/` types
**Effort:** M

---

**[FE] Playback Controls Bar**

**Description:** Build the playback controls bar below the preview panel. Includes play/pause, rewind-to-start, frame-step forward/back, current frame display, and a scrub slider. Playhead updates via `requestAnimationFrame` loop during playback — does NOT dispatch state updates on every rAF tick; instead, it mutates a CSS custom property directly for the timeline playhead indicator to minimize React work.

**Acceptance Criteria:**
- [ ] Play/pause toggles Remotion Player's `playing` prop
- [ ] Scrub slider moves playhead and updates Player `currentFrame`
- [ ] Frame counter displays `frame / totalFrames` and current timecode `HH:MM:SS:FF`
- [ ] Frame-step buttons advance/retreat by exactly 1 frame
- [ ] Keyboard shortcuts: Space (play/pause), Left/Right arrows (frame step), Home (rewind)
- [ ] rAF loop used for timeline playhead indicator — no full re-render at 60fps

**Dependencies:** Remotion Player integration
**Effort:** S

---

**Summary — Epic 2**

| Ticket | Area | Effort | Depends On |
|---|---|---|---|
| Base Remotion composition | FE | M | project-schema types |
| Remotion Player integration | FE | M | Base composition |
| Playback controls bar | FE | S | Player integration |

**Build order:** All FE, can be parallelized with Epic 1 backend work. Ship composition first, then Player, then controls. Performance profiling is mandatory before merging Player integration.

---
---

### EPIC 3 — AI Captions / Auto-Subtitles 🟢 Quick Win

**Pages / Surfaces:**
- Transcription modal (triggered from timeline context menu or asset menu)
- Caption track on the timeline
- Caption editor panel (click caption to edit text/timing)

---

**[BE] Transcription Job Endpoint + Worker**

**Description:** Build `POST /assets/:id/transcribe` which enqueues a transcription BullMQ job. The worker calls OpenAI Whisper API (or self-hosted Whisper) with the asset URI and returns word-level timestamps. On completion, stores the transcript as a `caption_tracks` row linked to the asset, and fires a webhook/poll response to the client.

**Acceptance Criteria:**
- [ ] Enqueues `transcribe-asset` job; returns `{ jobId }` immediately (async)
- [ ] Worker downloads asset from object storage, sends to Whisper with `response_format=verbose_json`
- [ ] Stores resulting `segments[]` (start, end, text) in a new `caption_tracks` table
- [ ] `GET /assets/:id/captions` returns transcript segments when ready
- [ ] Handles Whisper API errors with retry (3x, exponential backoff)
- [ ] Returns 409 if transcription already exists for asset

**Dependencies:** Asset ingest complete (asset must be in `ready` status)
**Effort:** M ⚠️ Whisper API cost; add rate limiting and user credit guard

---

**[DB] Caption Tracks Table Migration**

**Description:** Create a `caption_tracks` table that stores transcription results per asset. Each row contains the full segments array as JSON and metadata. Linked to `project_assets_current` via `asset_id`.

**Acceptance Criteria:**
- [ ] Table: `caption_track_id`, `asset_id`, `project_id`, `language`, `segments_json` (JSON), `created_at`
- [ ] Index on `(asset_id, project_id)`
- [ ] Migration is reversible (up/down)

**Dependencies:** None
**Effort:** XS

---

**[FE] Add Captions Track to Timeline from Transcription**

**Description:** After transcription completes, expose an "Add to Timeline" button in the asset panel. This adds a dedicated captions overlay track to the project document, populating it with caption clips derived from the Whisper segments. Each segment becomes a `TextOverlayLayer` clip with the segment text as content, positioned at the correct start/duration frame.

**Acceptance Criteria:**
- [ ] "Transcribe" button appears on video/audio assets in the browser
- [ ] Transcription status shown inline (pending/processing/ready/error)
- [ ] "Add Captions to Timeline" converts segments to caption clips in the project doc
- [ ] Caption clips render via `<TextOverlayLayer>` in the Remotion composition
- [ ] Clips are created in a new `captions` overlay track, not mixed with video tracks

**Dependencies:** Transcription endpoint, Caption table, Base composition with TextOverlayLayer
**Effort:** M

---

**[FE] Inline Caption Editor Panel**

**Description:** Clicking a caption clip on the timeline opens an inspector panel on the right. The panel shows the raw text (editable), start/end frame (editable), font size, color, and vertical position. Edits update the project document via Immer patch, triggering a debounced autosave.

**Acceptance Criteria:**
- [ ] Text field directly edits `clip.text` in project doc
- [ ] Start/end frame inputs adjust clip bounds with validation (no negative duration)
- [ ] Font size, color, vertical position controls map to `clip.style.*` fields
- [ ] Changes produce Immer patches and are undo/redo-able
- [ ] Preview updates in real-time as text/style is edited

**Dependencies:** Caption track on timeline
**Effort:** S

---

**Summary — Epic 3**

| Ticket | Area | Effort | Depends On |
|---|---|---|---|
| Caption tracks DB migration | DB | XS | None |
| Transcription job endpoint + worker | BE | M | Asset ingest, DB migration |
| Add captions track to timeline | FE | M | Transcription endpoint, composition |
| Inline caption editor panel | FE | S | Caption track on timeline |

**Build order:** DB migration and BE can start immediately in parallel. FE caption track depends on both BE and the Remotion composition having `TextOverlayLayer`. Caption editor is independent of BE.

---
---

### EPIC 4 — Version History & Rollback 🟢 Quick Win

**Pages / Surfaces:**
- Version history sidebar panel
- Restore version confirmation modal

---

**[BE] Project Version Persistence on Save**

**Description:** Build `POST /projects/:id/versions` which accepts the full `doc_json` snapshot, validates it against the project schema, and atomically: inserts a `project_versions` row, inserts a `project_version_patches` row (forward + inverse Immer patches from client), updates `projects.latest_version_id`, and updates the `*_current` materialized tables — all within a single InnoDB transaction. Returns the new `version_id`.

**Acceptance Criteria:**
- [ ] Full transaction: versions insert + patches insert + latest pointer update + current tables update
- [ ] Rolls back transaction on any failure, returns 500 with error detail
- [ ] Validates `doc_schema_version` matches server-side expected version
- [ ] Rejects save if `parent_version_id` doesn't match current `latest_version_id` (optimistic lock)
- [ ] Writes to `project_audit_log` with event type `project.update`
- [ ] Returns `{ versionId, createdAt }`

**Dependencies:** DB schema from architecture doc
**Effort:** M ⚠️ Optimistic lock logic + transaction correctness is critical

---

**[BE] List and Restore Version Endpoints**

**Description:** Build `GET /projects/:id/versions` (paginated, last 50) and `POST /projects/:id/versions/:versionId/restore`. Restore atomically updates `projects.latest_version_id` to the target version and re-materializes all `*_current` tables from that snapshot's `doc_json`.

**Acceptance Criteria:**
- [ ] `GET` returns `[{ versionId, createdAt, createdByUserId, durationFrames }]` newest-first
- [ ] `POST /restore` updates `latest_version_id` and rebuilds current tables in one transaction
- [ ] Writes `project.restore` event to audit log
- [ ] Restore returns the full project document at that version
- [ ] Only project owner or editors can restore (ACL check)

**Dependencies:** Version persistence endpoint
**Effort:** S

---

**[FE] Version History Panel**

**Description:** Build a collapsible version history panel. Shows a list of saved versions with timestamp, editor name, and a preview thumbnail (first frame of the composition at that version — can be lazy). Each version has a "Restore" button triggering a confirmation modal. After restore, the editor reloads the project document from the API.

**Acceptance Criteria:**
- [ ] Lists last 50 versions in reverse chronological order
- [ ] Timestamp shown as relative time ("2 minutes ago") with tooltip for absolute
- [ ] "Restore" button opens a confirmation modal ("This will replace your current version")
- [ ] On confirm: calls restore API, refetches project doc, updates editor store
- [ ] Loading state during restore; error toast on failure
- [ ] Current (latest) version is visually distinguished

**Dependencies:** List and restore version endpoints
**Effort:** S

---

**[FE] Autosave with Debounce + Immer Patch Generation**

**Description:** Instrument the editor's external store to generate Immer `patches` and `inversePatches` on every project document mutation using `produceWithPatches`. Debounce saves at 2s after last change. On save, send `{ doc_json, patches, inversePatches, parentVersionId }` to the version persistence endpoint. Show "Saved" / "Saving…" / "Unsaved changes" indicator in the header.

**Acceptance Criteria:**
- [ ] Every store mutation uses `produceWithPatches` from Immer
- [ ] Patches accumulated since last save sent with each version write
- [ ] Debounce: saves 2s after last mutation, immediate save on tab/window close
- [ ] Save status indicator in header: idle/"Saving…"/"Saved Xs ago"/"Unsaved changes"
- [ ] Handles 409 conflict (stale parent version) by showing "Reload to get latest" warning
- [ ] Undo/redo uses in-memory inverse patches (does NOT re-fetch from API for each undo)

**Dependencies:** Version persistence endpoint
**Effort:** M ⚠️ Undo/redo correctness edge cases require thorough testing

---

**Summary — Epic 4**

| Ticket | Area | Effort | Depends On |
|---|---|---|---|
| Project version persistence | BE | M | DB schema |
| List + restore version endpoints | BE | S | Version persistence |
| Autosave + Immer patch generation | FE | M | Persistence endpoint |
| Version history panel | FE | S | List + restore endpoints |

**Build order:** BE first — persistence endpoint is a blocker for everything. FE autosave and history panel can develop in parallel once both BE endpoints exist. Use a stub endpoint initially for FE development.

---
---

### EPIC 5 — Background Render Pipeline 🔵 Strategic Bet

**Pages / Surfaces:**
- Export modal (preset selection, format, quality)
- Render progress overlay / status page
- Completed renders list (download/share links)

---

**[DB] Render Jobs Table Migration**

**Description:** Create a `render_jobs` table tracking export requests. Fields include job status, progress percentage, output URI, preset settings, and error details.

**Acceptance Criteria:**
- [ ] Fields: `job_id`, `project_id`, `version_id`, `requested_by`, `status` (ENUM: queued/processing/complete/failed), `progress_pct`, `preset_json`, `output_uri`, `error_message`, `created_at`, `updated_at`
- [ ] Index on `(project_id, status)` and `(status, created_at)` for worker polling
- [ ] Migration is reversible

**Dependencies:** None
**Effort:** XS

---

**[BE] Create Render Job Endpoint**

**Description:** Build `POST /projects/:id/renders` which validates the requested preset, records a `render_jobs` row, and enqueues a `render-video` BullMQ job. Returns `{ jobId }` immediately. The client polls `GET /renders/:jobId` for progress.

**Acceptance Criteria:**
- [ ] Validates preset: resolution, fps, format (`mp4`/`webm`) are within allowed values
- [ ] Snapshots the current `latest_version_id` into the job (renders exact version)
- [ ] Returns `{ jobId, status: "queued" }` with 202 Accepted
- [ ] Rate-limits to max 2 concurrent renders per user (returns 429 if exceeded)
- [ ] Writes `render.requested` to audit log

**Dependencies:** Render jobs table
**Effort:** S

---

**[BE] Render Worker — Remotion SSR Job**

**Description:** Implement the `render-video` BullMQ job handler in `apps/render-worker/`. Fetches the project version's `doc_json` from MySQL, bundles the Remotion composition, calls `renderMedia()` with the project doc as inputProps, streams progress updates to the `render_jobs` table, and uploads the completed file to object storage.

**Acceptance Criteria:**
- [ ] Fetches `doc_json` from `project_versions` by `version_id`
- [ ] Bundles composition from `packages/remotion-comps/` via `bundle()`
- [ ] Calls `renderMedia()` with correct codec, fps, output format from preset
- [ ] Updates `render_jobs.progress_pct` every 5% via DB update (not Redis — keep simple)
- [ ] On success: uploads MP4 to object storage, updates job to `complete` with `output_uri`
- [ ] On failure: updates job to `failed` with `error_message`, retries up to 2x
- [ ] Uses `<OffthreadVideo>` path (SSR render environment)

**Dependencies:** Create render job endpoint; Remotion compositions package
**Effort:** L ⚠️ FFmpeg binary + Remotion renderer in container; video codec licensing; large file upload to S3

---

**[BE] Render Progress + Download Endpoint**

**Description:** Build `GET /renders/:jobId` returning current status and progress. When status is `complete`, return a time-limited presigned download URL (1-hour expiry). Build `GET /projects/:id/renders` listing all renders for a project.

**Acceptance Criteria:**
- [ ] Returns `{ status, progressPct, outputUrl?, errorMessage? }`
- [ ] `outputUrl` is a presigned GET URL valid for 1 hour (generated on request, not stored)
- [ ] Project renders list shows all jobs newest-first with status and file size
- [ ] Returns 403 if requesting user doesn't have read access to project

**Dependencies:** Render worker
**Effort:** S

---

**[FE] Export Modal + Render Preset Selection**

**Description:** Build an export modal triggered by a "Export" button in the header. Shows preset options (1080p MP4, 4K MP4, 720p MP4, Vertical 9:16, Square 1:1) with estimated render time. On submit, calls create render job and transitions to a progress view.

**Acceptance Criteria:**
- [ ] Preset cards show resolution, format, estimated time (static copy initially)
- [ ] "Start Export" calls `POST /renders`, disables button during request
- [ ] Transitions to progress view on success (shows animated progress bar)
- [ ] Progress bar polls `GET /renders/:jobId` every 3 seconds
- [ ] On completion: shows download button + "Share link" copy button
- [ ] On failure: shows error message with "Try again" button

**Dependencies:** Create render endpoint, progress endpoint
**Effort:** M

---

**Summary — Epic 5**

| Ticket | Area | Effort | Depends On |
|---|---|---|---|
| Render jobs DB migration | DB | XS | None |
| Create render job endpoint | BE | S | DB migration |
| Render worker SSR job | BE/INFRA | L | Render endpoint + compositions |
| Render progress + download endpoint | BE | S | Render worker |
| Export modal + progress UI | FE | M | All BE endpoints |

**Build order:** DB + endpoints first; worker is the longest task and should start in parallel with endpoint work. FE export modal can be built against a stubbed progress endpoint. The render worker is the highest-risk ticket in the entire project — allocate a dedicated spike to validate Remotion SSR + FFmpeg in the target container environment before committing to timeline.

---
---

### EPIC 6 — Timeline Editor (Multi-track) 🔵 Strategic Bet

> This epic is large. Recommend splitting into Phase 1 (core interactions) and Phase 2 (advanced editing).

**Pages / Surfaces:**
- Timeline panel (full-width, bottom of editor)
- Track headers (left sidebar within timeline)
- Clip lane (canvas/DOM per track)
- Context menus (right-click on clip, track)

---

#### Phase 1 — Core Timeline

**[FE] Timeline Ruler + Virtualized Track List**

**Description:** Build the timeline ruler (frame/timecode markers that scale with zoom) and the virtualized track list using `react-window FixedSizeList`. Each track row renders a track header (name, mute/lock toggles) and a clip lane. The timeline zoom level is stored in ephemeral UI state (not the project doc).

**Acceptance Criteria:**
- [ ] Ruler shows timecodes at appropriate intervals for current zoom level
- [ ] Tracks rendered via `react-window` — 100 tracks scrolls without jank
- [ ] Track header shows name (editable inline), mute toggle, lock toggle
- [ ] Zoom: horizontal scroll wheel zooms timeline (min 1px/frame, max 100px/frame)
- [ ] Ruler click sets playhead to that frame
- [ ] `overscanCount={5}` on the virtual list

**Dependencies:** Project doc type definitions
**Effort:** M

---

**[FE] Clip Rendering on Timeline**

**Description:** Render clips as absolutely-positioned divs within each track lane. Clip position and width are derived from `startFrame * pxPerFrame` and `durationFrames * pxPerFrame`. Clips show a thumbnail (for video) or waveform (for audio). Clip selection adds to `selectedClipIds` in ephemeral UI store.

**Acceptance Criteria:**
- [ ] Clips positioned correctly at all zoom levels
- [ ] Video clips show first-frame thumbnail (fetched from ingest metadata)
- [ ] Audio clips show waveform SVG (from ingest waveform data)
- [ ] Clip selection: click selects, Shift+click multi-selects, click empty area deselects
- [ ] Selected clips have a highlighted border
- [ ] Overlapping clips on same track displayed with slight vertical offset by `layer`

**Dependencies:** Timeline ruler + track list
**Effort:** M

---

**[FE] Clip Drag (Move) Interaction**

**Description:** Implement pointer-event-based drag for moving clips along the timeline. On drag, show a ghost/preview of the clip at the new position. On drop, dispatch an Immer mutation to update `clip.startFrame`. Snapping to other clip edges and to the playhead within a configurable threshold (default 5px).

**Acceptance Criteria:**
- [ ] Drag clip changes `startFrame` in project doc on drop
- [ ] Ghost clip shown during drag; original stays dimmed in place
- [ ] Snap to: clip edges, playhead, frame 0 — with visible snap indicator line
- [ ] Drag is cancelled on Escape key
- [ ] Dragging a locked clip is prevented (cursor shows "not-allowed")
- [ ] Multi-clip drag moves all selected clips maintaining relative offsets

**Dependencies:** Clip rendering
**Effort:** M ⚠️ Snapping math + pointer capture edge cases

---

**[FE] Clip Trim Interaction**

**Description:** Hovering near the left or right edge of a clip shows a resize cursor. Dragging trims the clip: left edge adjusts `startFrame` and `trimInFrames`; right edge adjusts `trimOutFrames`. Duration cannot be trimmed below 1 frame or beyond the source asset length.

**Acceptance Criteria:**
- [ ] Left-edge drag: adjusts `startFrame` + `trimInFrames` simultaneously (maintains clip position in timeline)
- [ ] Right-edge drag: adjusts `trimOutFrames` / `durationFrames`
- [ ] Cannot trim beyond asset boundaries
- [ ] Cannot trim clip to less than 1 frame duration
- [ ] Snapping applies during trim (same snap targets as move)
- [ ] Immer patch generated on trim completion (mouseup)

**Dependencies:** Clip drag interaction
**Effort:** M

---

**[FE] Clip Split Interaction**

**Description:** Right-click on a clip → "Split at Playhead" splits the clip at the current playhead frame into two clips. The first clip's `trimOutFrames` is set to the split point; the second clip gets a new `clipId`, `startFrame` = split point, `trimInFrames` = offset from original.

**Acceptance Criteria:**
- [ ] Right-click context menu shows "Split at Playhead" when playhead overlaps clip
- [ ] Split produces two new clips covering the original range
- [ ] Both clips reference the same `assetId`; trim values adjusted correctly
- [ ] Undo splits by merging the two clips back (via inverse Immer patch)
- [ ] Context menu also shows "Delete Clip", "Duplicate Clip"

**Dependencies:** Clip rendering, version history (Immer patches for undo)
**Effort:** S

---

**[BE] Project Partial Update Endpoint (Clip-level)**

**Description:** For high-frequency clip edits (drag, trim), a full document snapshot per mouse event is too heavy. Build `PATCH /projects/:id/clips/:clipId` that updates a single clip's mutable fields (`startFrame`, `durationFrames`, `trimInFrames`, `trimOutFrames`, `transform`) and updates `project_clips_current` without creating a full version snapshot. Version snapshot is still created on explicit save/autosave.

**Acceptance Criteria:**
- [ ] Updates `project_clips_current` row for the given clip
- [ ] Does NOT create a `project_versions` row
- [ ] Validates clip belongs to the project
- [ ] Returns updated clip fields
- [ ] Rate-limited to 60 req/s per project (covers 60fps scrubbing)

**Dependencies:** None
**Effort:** S

---

**Summary — Epic 6 (Phase 1)**

| Ticket | Area | Effort | Depends On |
|---|---|---|---|
| Timeline ruler + virtual track list | FE | M | project-schema types |
| Clip rendering on timeline | FE | M | Ruler + track list |
| Clip drag (move) interaction | FE | M | Clip rendering |
| Clip trim interaction | FE | M | Clip drag |
| Clip split + context menu | FE | S | Clip rendering, Immer patches |
| Clip partial update endpoint | BE | S | None |

**Build order:** All FE tickets are sequential (ruler → clips → drag → trim → split). BE partial update endpoint can be built independently and is low risk. Phase 2 (add track, delete track, multi-track reorder, keyboard shortcuts, undo/redo UI) should be a separate epic after Phase 1 is validated with real users.

---
---

## Overall Build Order Recommendation

```
Week 1–2:   [Epic 1 BE] Asset upload pipeline (presigned URLs + ingest worker)
            [Epic 2 FE] Remotion compositions + Player preview (parallel)
            [Epic 4 DB+BE] Version persistence (parallel)

Week 3–4:   [Epic 1 FE] Asset browser UI
            [Epic 3 DB+BE] Captions transcription pipeline
            [Epic 4 FE] Autosave + version history panel

Week 5–6:   [Epic 3 FE] Caption track + inline editor
            [Epic 5 DB+BE] Render pipeline (begin worker spike)
            [Epic 6 FE] Timeline ruler + clip rendering (begin)

Week 7–8:   [Epic 5 FE] Export modal + progress UI
            [Epic 6 FE] Clip drag + trim + split
            [Epic 6 BE] Partial update endpoint

Week 9+:    Epic 6 Phase 2 (advanced timeline)
            Epic: Team workspaces
            Epic: Text-to-video generation

Week 10+:   [Epic 7] Edit page integration consolidation
```

---
---

### EPIC 7 — Edit Page Integration: Consolidate Features into One Working Flow

> All core features exist individually (asset upload, timeline drag/trim, captions) but do not connect to each other. This epic wires them into a single, usable Edit page. The primary outcome: a user can upload media, place it on the timeline, navigate the timeline comfortably, and optionally add captions — all without leaving the page or hitting dead ends.

**Investigation Summary**

| Area | Status | Notes |
|---|---|---|
| Asset upload (UploadDropzone + useAssetUpload) | ✅ Works | |
| Asset browser with filter tabs + search | ✅ Works | |
| Clip drag on timeline (useClipDrag) | ✅ Works | |
| Clip trim on timeline (useClipTrim) | ✅ Works | |
| Right-click context menu: delete, duplicate, split | ✅ Works | Wired in ClipLane |
| Timeline ruler click-to-seek | ✅ Works | Already implemented |
| Timeline zoom (+ / − buttons) | ✅ Works | |
| Caption editor panel for selected text-overlay clip | ✅ Works | |
| useAddCaptionsToTimeline hook | ✅ Works | But unreachable from UI |
| **Add asset → timeline** | ❌ Missing | No "Add to Timeline" button or drag; AssetDetailPanel has disabled stubs |
| **Image clip type** | ❌ Missing | Schema has `video`, `audio`, `text-overlay` — no `image` type; images can't go on timeline |
| **Caption transcription flow** | ❌ Stranded | `TranscribeButton` exists but is not mounted anywhere in the running app |
| **Timeline horizontal scrollbar** | ❌ Missing | Wheel scroll works, no visible scrollbar |
| **Delete key shortcut for clips** | ❌ Missing | Only reachable via right-click context menu |
| **Asset delete (AssetDetailPanel)** | ❌ Disabled | Button exists as a stub |
| **Playhead auto-scroll during playback** | ❌ Missing | Timeline doesn't follow playhead |

**Pages / Surfaces:**
- Edit Page (`App.tsx` shell) — the single editor surface; all features rendered here but disconnected
- Asset Browser Panel (left sidebar) — upload, browse, filter; no way to push assets to timeline
- Timeline Panel (bottom) — tracks, clips, drag/trim; no way to receive assets, no scrollbar
- Right Sidebar / Inspector — shows `CaptionEditorPanel` on clip select; transcription flow stranded here

---

**[DB/Schema] Add `image` clip type to project-schema**

**Description:** `packages/project-schema/src/schemas/clip.schema.ts` only defines `video`, `audio`, and `text-overlay`. Images can be uploaded as assets (`image/*`) but cannot be placed on the timeline — there is no `ImageClip` type. This is a zero-dependency schema change that unblocks all downstream image-related FE work.

**Acceptance Criteria:**
- [ ] `imageClipSchema` added to `packages/project-schema/src/schemas/clip.schema.ts` with fields: `id`, `type: 'image'`, `assetId`, `trackId`, `startFrame`, `durationFrames`, `opacity` (0–1, default 1)
- [ ] `imageClipSchema` added to the `clipSchema` discriminated union
- [ ] `ImageClip` TypeScript type exported from `packages/project-schema/src/types/index.ts`
- [ ] Existing Zod tests pass; a new test covers the `image` variant
- [ ] `CLIP_COLORS` in `ClipBlock.tsx` updated to include `image: '#0EA5E9'` (no visual regression on existing types)

**Dependencies:** None
**Effort:** XS

---

**[FE] Add `image` clip rendering to `packages/remotion-comps` (ImageLayer)**

**Description:** `packages/remotion-comps/src/layers/ImageLayer.tsx` already exists per the architecture. `VideoComposition.tsx` must be updated to render `ImageClip` instances using it so the browser preview and SSR render both work for image clips.

**Acceptance Criteria:**
- [ ] `VideoComposition.tsx` maps `ImageClip` entries to `<ImageLayer>` using the asset `src` URL
- [ ] `ImageLayer.tsx` renders a Remotion `<Img>` primitive with `opacity` applied
- [ ] Image clip appears in the browser `<Player>` preview at correct start/duration
- [ ] No existing composition snapshot tests break

**Dependencies:** Add `image` clip type to project-schema
**Effort:** S

---

**[BE] Implement `DELETE /assets/:id` endpoint**

**Description:** `AssetDetailPanel` has a disabled "Delete Asset" button. The API has no route to delete an asset. This endpoint should soft-delete the asset record (set `deleted_at`) rather than hard-delete so object storage cleanup can be handled separately.

**Acceptance Criteria:**
- [ ] `DELETE /assets/:id` route registered in `apps/api/src/routes/assets.routes.ts`
- [ ] Controller calls `asset.service.ts`; service calls `asset.repository.ts` — no business logic in controller
- [ ] Returns `204 No Content` on success
- [ ] Returns `404` if asset not found for this user
- [ ] Returns `409` if asset is referenced by any existing clip in a project (guard against orphaning clips)
- [ ] Validated with auth middleware — only asset owner can delete
- [ ] Integration test covers happy path, 404, and 409

**Dependencies:** None
**Effort:** S

---

**[FE] Add "Add to Timeline" action to AssetDetailPanel**

**Description:** The biggest integration gap. Assets sit in the browser but there is no way to create a clip from them. Add a prominent "Add to Timeline" button to `AssetDetailPanel`. Logic lives in a new `useAddAssetToTimeline` hook in `features/asset-manager/hooks/`. The hook finds or creates an appropriate track, creates a clip of the matching type (`VideoClip`, `AudioClip`, `ImageClip`), and writes to the project store via `setProject`.

⚠️ _Requires creating a track + clip atomically in the project store; must handle the case where no compatible track exists._

**Acceptance Criteria:**
- [ ] "Add to Timeline" button visible in `AssetDetailPanel` for assets with `status === 'ready'`
- [ ] Button is disabled and shows tooltip "Processing…" when `status !== 'ready'`
- [ ] Clicking creates the correct clip type: `video/*` → `VideoClip`, `audio/*` → `AudioClip`, `image/*` → `ImageClip`
- [ ] If no track of the correct type exists, a new track is created with a default name (e.g. "Video 1")
- [ ] `durationFrames` is derived from `asset.durationSeconds * fps`; falls back to `project.fps * 5` if `durationSeconds` is null (images)
- [ ] Clip is placed immediately after the last clip on the chosen track (no overlap)
- [ ] `useAddAssetToTimeline` hook lives in `features/asset-manager/hooks/useAddAssetToTimeline.ts` with unit tests
- [ ] `AssetDetailPanel` does not contain business logic — it only calls the hook

**Dependencies:** Add `image` clip type to project-schema (for images)
**Effort:** M

---

**[FE] Enable drag-and-drop from AssetCard to TrackList**

**Description:** Users expect to drag an asset card from the left panel and drop it onto a track lane to create a clip at the drop position — the natural video editor workflow. `AssetCard` gets `draggable={true}` and `onDragStart` storing `assetId` in `dataTransfer`. `ClipLane` gets `onDragOver` + `onDrop` handlers that calculate `startFrame` from the drop X position using `pxPerFrame` and `scrollOffsetX`. Reuses `useAddAssetToTimeline` for clip creation logic.

⚠️ _Cross-component drag uses HTML5 DnD; drop target must identify the track from context and account for scrollOffsetX in the frame calculation._

**Acceptance Criteria:**
- [ ] Dragging an `AssetCard` shows a drag ghost (browser default is acceptable)
- [ ] Hovering over a `ClipLane` highlights it with a drop affordance (border or background tint)
- [ ] Dropping creates the correct clip type at the pointer's frame position on the target track
- [ ] If dropped on the wrong track type (e.g. audio asset on video track), drop is rejected and user sees feedback
- [ ] Clip is not created if `asset.status !== 'ready'`
- [ ] `scrollOffsetX` is correctly accounted for in the frame calculation
- [ ] Existing drag (move) interactions via `useClipDrag` are unaffected

**Dependencies:** Add "Add to Timeline" action (`useAddAssetToTimeline` hook reused), Add `image` clip type to project-schema
**Effort:** M

---

**[FE] Surface caption transcription flow in AssetDetailPanel**

**Description:** `TranscribeButton` and `useAddCaptionsToTimeline` exist and work but are mounted nowhere in the running app — the caption workflow is completely inaccessible. Mount `TranscribeButton` inside `AssetDetailPanel` (visible only for `video/*` and `audio/*` assets). On transcription completion, show an "Add Captions to Timeline" button that calls `useAddCaptionsToTimeline`. No changes to existing hooks required — this is wiring only.

**Acceptance Criteria:**
- [ ] `TranscribeButton` rendered in `AssetDetailPanel` for video/audio assets only
- [ ] Button disabled when `asset.status !== 'ready'`
- [ ] `useTranscriptionStatus` polling starts after transcribe is triggered; UI reflects idle → processing → done/error states
- [ ] Once transcription is `done`, an "Add Captions to Timeline" button appears
- [ ] Clicking it calls `useAddCaptionsToTimeline` and the caption track appears in the timeline
- [ ] If a "Captions" track already exists (idempotency guard in hook), button shows "Captions already added" and is disabled
- [ ] No changes to `TranscribeButton`, `useTranscriptionStatus`, or `useAddCaptionsToTimeline`

**Dependencies:** None (all backend logic already exists)
**Effort:** S

---

**[FE] Add horizontal scrollbar to timeline panel**

**Description:** The only timeline scroll mechanism is the mouse wheel — there is no visible scrollbar for click-drag navigation. This is the "comfortable and natural way to scroll" the user described. Add a custom horizontal scrollbar strip below the clip lanes in `TimelinePanel`. The thumb width represents the visible viewport relative to total content width (`durationFrames * pxPerFrame`). Scrolling updates `scrollOffsetX` in the ephemeral store.

**Acceptance Criteria:**
- [ ] A horizontal scrollbar is visible at the bottom of the timeline panel
- [ ] Scrollbar thumb width correctly reflects the ratio of visible width to total content width
- [ ] Dragging the thumb updates `scrollOffsetX` in real time (no jank)
- [ ] Scrollbar position updates when `scrollOffsetX` changes from wheel scroll
- [ ] Scrollbar is hidden/inactive when all content fits in the visible area
- [ ] Works at all zoom levels (1–100 px/frame)
- [ ] Scrollbar rendered as an additional strip — does not reduce clip lane height

**Dependencies:** None
**Effort:** S

---

**[FE] Add `Delete` key shortcut to remove selected clips**

**Description:** Clips can only be deleted via the right-click context menu. The standard `Delete` / `Backspace` keyboard shortcut is missing, making the timeline feel unpolished. Add a `keydown` listener scoped to when the timeline panel is focused. Deletes all `selectedClipIds` from the project store, skipping locked clips. Must not fire when focus is inside an `<input>`, `<textarea>`, or `<select>`.

**Acceptance Criteria:**
- [ ] Pressing `Delete` or `Backspace` when clips are selected removes them from the project store
- [ ] Deleted clips are removed from `selectedClipIds` in the ephemeral store
- [ ] Locked clips in the selection are skipped (not deleted)
- [ ] No deletion when focus is inside an `<input>`, `<textarea>`, or `<select>`
- [ ] Listener is added/removed correctly (no stale closures or memory leaks)
- [ ] Unit test covers the happy path and the input-focused guard

**Dependencies:** None
**Effort:** XS

---

**[FE] Enable "Delete Asset" button in AssetDetailPanel**

**Description:** The "Delete Asset" button is permanently `disabled` in `AssetDetailPanel`. Wire it to `DELETE /assets/:id` using a React Query mutation. Show a confirmation dialog before proceeding. On success, invalidate the asset list cache and close the detail panel. On `409` (asset in use by a clip), show an actionable error message.

**Acceptance Criteria:**
- [ ] Clicking "Delete Asset" shows a confirmation dialog before proceeding
- [ ] On confirm, calls `DELETE /assets/:id` and shows a loading spinner on the button
- [ ] On success, invalidates `['assets', projectId]` query and sets `selectedAssetId` to `null`
- [ ] On `409` (asset in use), shows: "This asset is used by a clip on the timeline. Remove the clip first."
- [ ] On generic error, shows an error toast
- [ ] Button never enabled when `asset.status === 'processing'`

**Dependencies:** Implement `DELETE /assets/:id` BE ticket
**Effort:** S

---

**[FE] Auto-scroll timeline to follow playhead during playback**

**Description:** When the project plays, the playhead moves across the timeline but `scrollOffsetX` stays fixed. After a few seconds the playhead exits the visible area and the user loses context. Add logic in `TimelinePanel` to update `scrollOffsetX` to keep the playhead visible. Only activate when the playhead exits the visible window; respect manual scrolling by disabling auto-follow until playback restarts.

**Acceptance Criteria:**
- [ ] During playback, `scrollOffsetX` updates to keep the playhead within the visible clip lane
- [ ] Auto-follow only triggers when the playhead exits the visible window — not on every frame
- [ ] Manual scrolling during playback disables auto-follow until play is restarted
- [ ] Auto-follow is inactive when paused (ruler scrubbing does not trigger it)
- [ ] Scroll updates batched with `requestAnimationFrame` — no jank

**Dependencies:** None
**Effort:** S

---

**[FE] Auto-derive project duration from timeline content**

**Description:** `projectDoc.durationFrames` is hardcoded to `300` (10 seconds at 30 fps) and never updates as clips are added or moved. Both the Remotion `<Player>` (`PreviewPanel.tsx:43 durationInFrames={projectDoc.durationFrames}`) and the timeline ruler width read this field directly, so the playable range and ruler are always 10 seconds regardless of content. The project duration should automatically equal the end frame of the last clip on the timeline, with a configurable minimum floor.

The computation logic — `max(clip.startFrame + clip.durationFrames)` over all clips, clamped to a minimum — belongs in `packages/editor-core/` as a pure function. It must be called inside `setProject()` in `apps/web-editor/src/store/project-store.ts` so that every store mutation (drag, trim, add clip, delete clip) automatically keeps `durationFrames` in sync without any component knowing about it.

**Acceptance Criteria:**
- [ ] A pure function `computeProjectDuration(clips: Clip[], fps: number, minSeconds?: number): number` is added to `packages/editor-core/` with unit tests; it returns `max(clip.startFrame + clip.durationFrames)` across all clips, floored at `fps * minSeconds` (default minimum: 5 seconds)
- [ ] `setProject()` in `project-store.ts` calls `computeProjectDuration` and writes the result back to `projectDoc.durationFrames` before notifying listeners
- [ ] Remotion `<Player>` (`durationInFrames`) updates immediately when a clip is added that extends beyond the current duration
- [ ] Timeline ruler width grows automatically when clips are placed beyond the current ruler end
- [ ] Adding a clip, dragging a clip to a new position, trimming, and deleting a clip all correctly update `durationFrames`
- [ ] When all clips are deleted, duration falls back to the minimum floor (not 0 — a zero-frame Remotion composition crashes)
- [ ] Unit tests cover: empty clips (returns floor), single clip, multi-clip (takes max), clip deletion shrinks duration

**Dependencies:** None
**Effort:** S

---

**[FE] Manual project duration control in timeline toolbar**

**Description:** Even with auto-derived duration, users need the ability to manually extend the timeline (e.g. to add a black tail after the last clip, or to set a fixed output length). The timeline toolbar already has zoom +/− buttons; add a duration input control to it. The control should display the current duration in seconds (derived from `projectDoc.durationFrames / fps`) and allow the user to type or scrub a new value. Writing a manual value overrides auto-derive for that session; adding a clip that extends beyond the manual value should expand it again (auto-derive always wins upward, manual only extends downward).

**Acceptance Criteria:**
- [ ] Timeline toolbar shows current duration as a number input (seconds, 1 decimal place, e.g. `10.0 s`)
- [ ] User can type a new duration value; on blur or Enter the project store is updated with `Math.round(value * fps)` frames
- [ ] Manual value is clamped: minimum = `fps * 1` (1 second floor), maximum = `fps * 3600` (1 hour cap)
- [ ] If a clip is later placed beyond the manually-set duration, `setProject()` auto-derives upward (the existing `computeProjectDuration` guard in the store handles this)
- [ ] The input reflects changes from auto-derive (reactive to store updates)
- [ ] Input styled consistently with the existing toolbar (dark background, `#F0F0FA` text, `Inter` font, same height as zoom buttons)

**Dependencies:** Auto-derive project duration from timeline content
**Effort:** XS

---

**Summary — Epic 7**

| Ticket | Area | Effort | Depends On |
|---|---|---|---|
| Add `image` clip type to project-schema | Schema | XS | None |
| Add `image` clip rendering (ImageLayer) | FE/Remotion | S | image clip schema |
| Implement `DELETE /assets/:id` | BE | S | None |
| Add horizontal scrollbar to timeline | FE | S | None |
| Add `Delete` key shortcut for clips | FE | XS | None |
| Auto-derive project duration from clips | FE | S | None |
| Manual project duration control in toolbar | FE | XS | Auto-derive ticket |
| Add "Add to Timeline" to AssetDetailPanel | FE | M | image clip schema |
| Surface caption transcription in AssetDetailPanel | FE | S | None |
| Drag-and-drop AssetCard to TrackList | FE | M | "Add to Timeline" hook |
| Enable "Delete Asset" button | FE | S | DELETE /assets/:id BE |
| Auto-scroll timeline during playback | FE | S | None |

**Build order:** Start with the two zero-dependency unblocking items in parallel: the **`image` clip schema** (XS) and **`DELETE /assets/:id`** (S). Immediately also ship **auto-derive project duration** (S, pure FE) — this is a silent but critical fix that makes every other timeline feature behave correctly. While those land, a frontend developer can simultaneously ship **horizontal scrollbar**, **Delete key shortcut**, **caption transcription wiring**, **manual duration control**, and **auto-scroll** — all pure FE. The **"Add to Timeline" button** is the single most impactful user-facing ticket; once it ships the page is usable end-to-end. **Drag-and-drop** is Phase 2 polish — build last, reusing `useAddAssetToTimeline`.

The fastest path to a demo-able product is: **upload asset → auto-caption → export**. That's Epics 1 + 3 + 5, and can be shown without a full timeline editor. The timeline (Epic 6) is the most complex surface and runs in parallel without blocking the initial value loop.
