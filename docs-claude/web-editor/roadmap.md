## apps/web-editor — Domain Roadmap
> Part of: [← Project Roadmap](../roadmap.md)
> Generated: 2026-04-13 | 310 files

---

## Responsibility
React SPA editor shell. Renders the editor layout (TopBar + left sidebar + preview + right sidebar + timeline), owns all client-side project state (via Zustand-style external stores), drives the Remotion `<Player>` preview, talks to `apps/api` via a typed fetch wrapper, and exposes feature-sliced workflows: asset upload, timeline editing, captions, AI generation, preview, export, version history, auth.

---

## Architecture

**Feature-sliced design:**
```
src/
  main.tsx               ← Bootstrap: Router + QueryClient + AuthProvider
  App.tsx                ← Editor shell (2-col desktop / stacked mobile)
  App.panels.tsx         ← PreviewSection, RightSidebar, MobileTabContent
  TopBar.tsx             ← Title, save status, undo/redo, export, settings
  SaveStatusBadge.tsx    ← Autosave indicator in TopBar
  features/              ← Feature slices (see below)
  shared/                ← Cross-feature primitives (thin)
  store/                 ← Global state (project + history + ephemeral)
  lib/                   ← api-client, config, constants
```

**Each `features/<slice>/` typically contains:**
```
api.ts         ← Feature's REST calls — imports apiClient from lib/
types.ts       ← Feature-local TS types (not shared across features)
components/    ← React components (*.tsx) + *.styles.ts + *.test.tsx + *.fixtures.ts
hooks/         ← Custom hooks wrapping TanStack Query + store selectors
utils.ts       ← Pure helpers (optional)
```

**Key rule:** Features do NOT import from each other's internals. Cross-feature sharing goes through `store/` (state) or `shared/` (utils/hooks/components). The one permitted exception: `App.tsx` is allowed to import from all features since it's the shell composer.

---

## Bootstrap & Routing

`src/main.tsx`:
- Injects a tiny CSS reset (`box-sizing`, zero body margin, `#root` at 100vw/100vh).
- Creates a single `QueryClient`.
- `createBrowserRouter`:
  - `/login`, `/register`, `/forgot-password`, `/reset-password` — public, unwrapped
  - `/editor` — wrapped in `<ProtectedRoute>` → `<App />`
  - `*` → `<Navigate to="/editor" replace />`
- Tree: `<QueryClientProvider>` → `<AuthProvider>` → `<RouterProvider>`.

`App.tsx`: two layouts, switched at `768px` via `useWindowWidth()`:
- **Desktop (≥768):** 3 columns + timeline bottom — left sidebar (AI / Asset tabs via `LeftSidebarTabs`), preview center, right inspector (clip editor), resizable timeline bottom (`useTimelineResize`).
- **Mobile (<768):** vertical stack — TopBar, PreviewPanel, `MobileInspectorTabs`, TimelinePanel, `MobileBottomBar`.

Modals held at shell level: `ProjectSettingsModal`, `ExportModal`, `RendersQueueModal`, `VersionHistoryPanel` (drawer). Project initialization via `useProjectInit()`. Keyboard shortcuts + undo/redo wired via `useKeyboardShortcuts()` + `useUndoRedo()`.

---

## Global State (`src/store/`)

Three hand-rolled stores, each a module-level singleton with `useSyncExternalStore` selectors. **No Redux/Zustand libraries** — plain subscribe/listeners pattern.

### `project-store.ts` — the ProjectDoc
- Holds the canonical `ProjectDoc` snapshot.
- `setProject(doc)` uses Immer `produceWithPatches()` to derive forward + inverse patches, recomputes `durationFrames` via `editor-core.computeProjectDuration(clips, fps)`, and pushes patches to `history-store`.
- Exports: `getSnapshot()`, `subscribe()`, `setProject()`, hooks for React subscribers.
- Tracks `currentVersionId` for optimistic-lock saves.
- Dev fixture `DEV_PROJECT` (ID `00000000-0000-0000-0000-000000000001`) seeds until project CRUD ships.

### `history-store.ts` — undo/redo + autosave queue
- Stacks: `undoStack` (applied), `redoStack` (undone), `accumulatedPatches` / `accumulatedInversePatches` (batched for autosave).
- `pushPatches(patches, inverse)` — called from `project-store.setProject`; clears redo stack on new op.
- `undo()` / `redo()` — apply/restore patches to project-store.
- `drainPatches()` — consumed by `useAutosave` to ship the diff to `POST /projects/:id/versions`.

### `ephemeral-store.ts` — UI-only state
- `playheadFrame`, `selectedClipIds`, `zoom`, `pxPerFrame` ([1..100]), `scrollOffsetX`, `volume` ([0..1]), `isMuted`.
- Never persisted, never versioned.

### `timeline-refs.ts`
- Shared DOM ref registry (timeline container, clip lane elements) so drag/snap hooks can read live layout without prop drilling.

---

## Features Index

| Feature | Path | Files | Notes |
|---|---|---|---|
| Timeline | `features/timeline/` | 83 | BIG — clip editing, drag/trim/snap, track mgmt, editor panels per clip type |
| AI Generation | `features/ai-generation/` | 46 | fal.ai + ElevenLabs catalog browser, generation form, polling |
| Asset Manager | `features/asset-manager/` | 45 | Upload, browse, rename, delete, replace, preview, add-to-timeline |
| Captions | `features/captions/` | 22 | Transcribe button, caption editor, add-to-timeline |
| Auth | `features/auth/` | 19 | Login/register/forgot/reset/OAuth, `ProtectedRoute`, `AuthProvider` |
| Preview | `features/preview/` | 19 | Remotion `<Player>`, playback controls, prefetch, mobile bars |
| Export | `features/export/` | 19 | ExportModal (preset picker + progress), RendersQueueModal |
| Version History | `features/version-history/` | 17 | Autosave, undo/redo, version list, restore, keyboard shortcuts |
| Project Settings | `features/project-settings/` | 3 | Modal (title, dimensions, fps) |
| Project | `features/project/` | 3 | `useProjectInit` — fetch/create initial project |

---

## Feature: Timeline (`features/timeline/`)

The largest and most mechanically complex feature. Owns clip rendering, drag/trim/snap, track management, and per-clip-type editor panels.

**Components (`components/`):**
- `TimelinePanel.tsx` — top-level panel. Scrollbar + toolbar + ruler + track list. Tests split by concern: `.scrollbar.test`, `.toolbar.test`.
- `TimelineRuler.tsx` — playhead scrubber + frame ticks.
- `ScrollbarStrip.tsx` — horizontal strip navigation; drag via `useScrollbarThumbDrag`.
- `TrackList.tsx` / `TrackRow.tsx` / `TrackHeader.tsx` — track column + row virtualization. `trackHeaderStyles.ts`, `trackListStyles.ts`.
- `AddTrackMenu.tsx` / `DeleteTrackDialog.tsx` — track CRUD UI.
- `ClipLane.tsx` + `ClipLaneGhosts.tsx` — clip placement area. Tests: `.dnd`, `.drag`, `.trim`, `.contextmenu`.
- `ClipBlock.tsx` — single clip DOM node. Tests include `.caption.test`.
- `ClipContextMenu.tsx` + `clipContextMenuActions.ts` — right-click menu actions.
- `WaveformSvg.tsx` — audio waveform overlay.
- `TimelineResizeHandle.tsx` — drag-to-resize the timeline panel height.
- **Editor panels (right sidebar):** `VideoClipEditorPanel.tsx`, `AudioClipEditorPanel.tsx`, `ImageClipEditorPanel.tsx` — show when a clip of that type is selected.

**Hooks (`hooks/`):**
- **Drag/Trim:** `useClipDrag.ts` (+ `useClipDragHelpers`, `crosstrack` test), `useClipTrim.ts`, `clipTrimMath.ts`
- **Drop from asset browser:** `useAssetDrop.ts`, `useDropAssetToTimeline.ts`, `useDropAssetWithAutoTrack.ts`
- **Snapping:** `useSnapping.ts` — snap to frame boundaries, other clip edges, playhead
- **Scroll/zoom:** `useTimelineWheel.ts`, `useScrollbarThumbDrag.ts`, `useTimelineResize.ts`
- **Track ops:** `useAddEmptyTrack.ts`, `useTrackReorder.ts`
- **Keyboard:** `useClipDeleteShortcut.ts`
- **Context menu:** `useClipContextMenu.ts`
- **Per-clip-type editors:** `useVideoClipEditor.ts`, `useAudioClipEditor.ts`, `useImageClipEditor.ts`

**Backend:** `features/timeline/api.ts` — wraps `POST /projects/:id/clips` and `PATCH /projects/:id/clips/:clipId` (the high-frequency 60/s one). Most mutations go through project-store → history-store → autosave instead.

---

## Feature: Asset Manager (`features/asset-manager/`)

**Components:**
- `AssetBrowserPanel.tsx` — left sidebar tab; grid of `AssetCard`s.
- `AssetCard.tsx` — draggable thumbnail. Tests for `.dnd`, `.transcribe`.
- `AssetDetailPanel.tsx` — detail view. Tests for `.preview`, `.rename`.
- `AssetPreviewModal.tsx` — full-size preview player.
- `UploadDropzone.tsx` + `UploadProgressList.tsx` — drag/drop or button upload.
- `AddToTimelineDropdown.tsx` — target track picker.
- `InlineRenameField.tsx` — inline edit.
- `DeleteAssetDialog.tsx`, `ReplaceAssetDialog.tsx` — confirm modals.

**Hooks:**
- `useAssetUpload.ts` — presigned PUT flow: `POST /projects/:id/assets/upload-url` → XHR PUT to S3 → `POST /assets/:id/finalize`.
- `useAssetPolling.ts` — polls `GET /assets/:id` while `status = processing`.
- `useAddAssetToTimeline.ts` — creates a clip from an asset at a given track/start frame (+ placement test).
- `useDeleteAsset.ts`, `useReplaceAsset.ts` — mutate calls.
- `useTracksForAsset.ts` — filter compatible tracks for a given asset type.

---

## Feature: AI Generation (`features/ai-generation/`)

**Components:**
- `LeftSidebarTabs.tsx` — switches left sidebar between Asset browser and AI panel.
- `AiGenerationPanel.tsx` — main form. Tests: `.form`, `.states` (loading/error/done). Style tokens in `aiGenerationPanelTokens.ts` + `aiGenerationFieldStyles.ts` + `aiGenerationPanelStyles.ts`.
- `CapabilityTabs.tsx` — top tabs grouping models by capability (image / video / audio / text).
- `ModelCard.tsx` — one catalog entry card.
- `GenerationOptionsForm.tsx` — dynamically rendered inputs from the model's option schema.
- `SchemaFieldInput.tsx` — per-field input widget (text / number / select / etc).
- `AssetPickerField.tsx` — picks an existing asset to feed into image-to-* / audio-to-audio models.
- `VoicePickerField.tsx` + `VoicePickerModal.tsx` + `VoicePickerRows.tsx` — ElevenLabs voice browser (library + user's own clones). Tests include `.audio` for sample playback.
- `GenerationProgress.tsx` — polled progress bar.

**Hooks:**
- `useAiGeneration.ts` — submit mutation → `POST /projects/:id/ai/generate` → returns jobId.
- `useJobPolling.ts` — polls `GET /ai/jobs/:jobId` until `done`/`failed`; on done, triggers asset-manager refresh.
- `useAvailableVoices.ts` — fetches `GET /ai/voices/available` (ElevenLabs library, Redis-cached backend).
- `useUserVoices.ts` — fetches `GET /ai/voices` (user's cloned voices from `user_voices`).

---

## Feature: Captions (`features/captions/`)

**Components:**
- `TranscribeButton.tsx` — on an asset; calls `POST /assets/:id/transcribe`. Tests: `.inprogress`, `.multitrack`.
- `CaptionEditorPanel.tsx` — right sidebar when a caption clip is selected; edits segment text.

**Hooks:**
- `useTranscriptionStatus.ts` — polls `GET /assets/:id/captions`.
- `useCaptionEditor.ts` — segment edit actions on the project doc.
- `useAddCaptionsToTimeline.ts` — materializes `caption_tracks` into `CaptionClip`s on a new track. Tests for backward-compat (`compat.test`) and generic caption path (`caption.test`).

---

## Feature: Preview (`features/preview/`)

**Components:**
- `PreviewPanel.tsx` — hosts the Remotion `<Player>` bound to `packages/remotion-comps/VideoComposition`.
- `PlaybackControls.tsx` — transport buttons (play/pause/seek/time).
- `VolumeControl.tsx` — volume slider (backed by `ephemeral-store`).
- `MobileInspectorTabs.tsx`, `MobileBottomBar.tsx` — mobile shell chrome.

**Hooks:**
- `useRemotionPlayer.ts` — instantiates and configures the Player.
- `usePlaybackControls.ts` — play/pause/seek state machine. Tests split: `.raf` (RAF driver), `.seek`, general.
- `usePrefetchAssets.ts` — warm Remotion `prefetch()` for visible assets. Uses `lib/api-client.buildAuthenticatedUrl` (via `?token=`) since Remotion media elements can't set headers.

---

## Feature: Export (`features/export/`)

**Components:**
- `ExportModal.tsx` — preset picker + progress. Fixtures and phase tests (`ExportModal.phases.test.tsx`).
- `RenderProgressBar.tsx` — visual for an in-progress render.
- `RendersQueueModal.tsx` — list of all renders for the project.

**Hooks:**
- `useExportRender.ts` — `POST /projects/:id/renders` → then polls `GET /renders/:jobId`.
- `useListRenders.ts` — `GET /projects/:id/renders`.

---

## Feature: Version History (`features/version-history/`)

Drives **autosave**, **undo/redo**, **keyboard shortcuts**, and **version restore** — all the history-related behavior.

**Hooks:**
- `useAutosave.ts` — debounced drain of `history-store.accumulatedPatches`, wraps `POST /projects/:id/versions` with optimistic lock (`parentVersionId`). Test splits: `.save`, `.timing`, `.conflict` (409 handling).
- `useUndoRedo.ts` — wraps `history-store.undo/redo`; exposes `canUndo`/`canRedo`.
- `useKeyboardShortcuts.ts` — global `⌘Z`/`⌘⇧Z`, delete, etc.
- `useVersionHistory.ts` — `GET /projects/:id/versions` for the panel.

**Components:**
- `VersionHistoryPanel.tsx` — list drawer showing last 50 versions.
- `RestoreModal.tsx` — confirm + `POST /projects/:id/versions/:versionId/restore`.

---

## Feature: Auth (`features/auth/`)

**Components:**
- `AuthProvider.tsx` — React context reading token from `localStorage`; exposes `user`, `login`, `register`, `logout`.
- `ProtectedRoute.tsx` — redirects to `/login` when no session.
- `LoginPage.tsx`, `RegisterPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx` — auth forms; shared `authStyles.ts`.

**Hooks:**
- `useAuth.ts` — wraps the provider context.
- `useOAuthToken.ts` — reads `?token=...` returned by OAuth callback redirect and writes it to `localStorage`.

---

## Feature: Project / Project-Settings / Small Features

- `features/project/hooks/useProjectInit.ts` — on mount: fetch existing project (currently hardcoded `DEV_PROJECT_ID` from `lib/constants.ts`) or create one, hydrate `project-store`.
- `features/project-settings/components/ProjectSettingsModal.tsx` — edit `title`, `width`, `height`, `fps`.

---

## Shared (`src/shared/`)

| Path | Contents |
|---|---|
| `shared/hooks/useWindowWidth.ts` | Reactive window width (for mobile breakpoint) |
| `shared/utils/formatTimecode.ts` | Frame → `HH:MM:SS.ff` |
| `shared/utils/formatRelativeDate.ts` | For version history list |
| `shared/components/` | Currently empty — shared primitives live in `packages/ui` if reused across apps |

---

## Lib (`src/lib/`)

| File | Purpose |
|---|---|
| `api-client.ts` | **The ONLY file that calls `fetch`.** Features import `apiClient.get/post/patch/delete`. Attaches `Authorization: Bearer <token>` from `localStorage`, handles 401 → redirect to `/login`, exposes `buildAuthenticatedUrl(url)` that appends `?token=` for media elements |
| `config.ts` | Zod-validated `import.meta.env` access — the ONLY file allowed to read env in web-editor. Currently just `apiBaseUrl` from `VITE_PUBLIC_API_BASE_URL` |
| `constants.ts` | `DEV_PROJECT_ID` (hardcoded until project CRUD ships) |

---

## Remotion Integration

- `<Player>` from `@remotion/player` rendering `VideoComposition` from `@ai-video-editor/remotion-comps` in `features/preview/components/PreviewPanel.tsx`.
- The same composition bundle is reused server-side by `render-worker` — any DOM-only hack in the layers will break SSR renders.
- Media URLs passed to layers go through `buildAuthenticatedUrl()` because Remotion's internal `<Video>`/`<Audio>`/prefetch cannot attach headers. That's why `apps/api` accepts `?token=` as a fallback in `auth.middleware`.

---

## Testing

- **Unit + component:** Vitest + `@testing-library/react` + `jsdom`. Co-located `*.test.tsx` / `*.test.ts`.
- **Many-file splits:** Large feature components (e.g. `AiGenerationPanel`, `useAutosave`, `useClipDrag`, `usePlaybackControls`, `ClipLane`, `AssetCard`) are split into multiple test files by scenario (`.form`, `.states`, `.timing`, `.conflict`, `.dnd`, `.drag`, `.trim`, `.contextmenu`, `.transcribe`). Follow this pattern when tests grow large — it keeps each file focused.
- **Fixtures:** Co-located `*.fixtures.ts` / `.tsx` with reusable builders.
- **Style tests:** Some style modules have `.test.ts` (e.g. `trackHeaderStyles.test.ts`) asserting token values.
- **E2E:** Playwright specs in `apps/web-editor/e2e/` (app-level) and top-level `e2e/` (cross-app: `app-shell`, `asset-manager`, `preview`).
- **Run:** `npm --workspace @cliptale/web-editor run test` (unit) / `npm run e2e` from repo root.

---

## External Dependencies

| Package | Purpose |
|---|---|
| `react`, `react-dom` (18) | UI |
| `react-router-dom` 7 | Routing |
| `@tanstack/react-query` | Server-state cache (mutations, polling) |
| `@remotion/player`, `remotion` | In-browser preview playback |
| `immer` | `produceWithPatches` for history/autosave |
| `react-window` | Timeline track row virtualization |
| `zod` | Env validation |

---

## Cross-Domain Links

- **Consumes:**
  - `packages/project-schema` — `ProjectDoc`, `Clip`, `Track` types
  - `packages/api-contracts` — `AI_MODELS` catalog, types for AI panel
  - `packages/editor-core` — `computeProjectDuration`
  - `packages/remotion-comps` — `VideoComposition` for the Player
  - `packages/ui` — (thin; most UI is local to this app)
- **Calls:** `apps/api` via `lib/api-client.ts`
- **Ships to:** served standalone by Vite at `localhost:5173` (docker-compose `web-editor` service)

---

## Agent Instructions

**To add a new feature slice:**
1. `mkdir -p src/features/<name>/{components,hooks}`
2. `api.ts` — feature REST calls; import `apiClient` from `lib/api-client`, never call `fetch` directly.
3. `types.ts` — feature-local types.
4. Components + hooks. Hooks wrap `useMutation`/`useQuery` or subscribe to `project-store`/`ephemeral-store`.
5. Compose into `App.tsx` (the only file allowed to cross feature boundaries).
6. Co-locate `*.test.tsx` and `*.fixtures.ts`.

**To add a new clip type:**
1. Update `packages/project-schema/src/schemas/clip.schema.ts` first.
2. Add a Remotion layer in `packages/remotion-comps/src/layers/`.
3. Register in `VideoComposition.tsx`.
4. Add a `<Type>ClipEditorPanel.tsx` in `features/timeline/components/` + matching `use<Type>ClipEditor.ts` hook.
5. Update `ClipLane.tsx` / `ClipBlock.tsx` rendering switch.
6. Add migration to widen the `project_clips_current.clip_type` enum in the API (see `007_add_image_clip_type.sql`, `018_add_caption_clip_type.sql` for precedent).

**To mutate project state:** Read `project-store.getSnapshot()`, build a new `ProjectDoc` (prefer a pure transform function), call `setProject(newDoc)`. This auto-derives Immer patches and pushes them into `history-store` — undo/redo and autosave wire up automatically.

**To add a high-frequency drag/trim handler:** Use the clip-patch endpoint (`api/src/routes/clips.routes.ts` rate-limited 60/s) via `features/timeline/api.ts`, NOT a version snapshot. Updates sent this way bypass history (same as the backend — no version row is written).

**To add a new REST call:**
1. Add the method in that feature's `api.ts` — call `apiClient.get/post/etc`.
2. Wrap in a TanStack Query hook in `hooks/use<Thing>.ts`.
3. For polling: follow `useAssetPolling.ts` / `useJobPolling.ts` (conditional `refetchInterval` until terminal state).
4. For media URLs that go to `<video>` / `<img>` / Remotion: wrap with `buildAuthenticatedUrl()`.

**Styling:** Inline-style + `*.styles.ts` files returning style object maps. **No CSS files, no CSS-in-JS library.** Style tokens go in `*.tokens.ts` files (see `aiGenerationPanelTokens.ts`).

**Forbidden:** Direct `fetch()` outside `lib/api-client.ts`. Reading `import.meta.env` outside `lib/config.ts`. Importing between sibling features (go through `store/` or `shared/`).

**Playwright note:** Per `project_dev_workflow` memory, all testing is done through Docker Compose — not bare localhost. The e2e config points at the compose-mounted web-editor.
