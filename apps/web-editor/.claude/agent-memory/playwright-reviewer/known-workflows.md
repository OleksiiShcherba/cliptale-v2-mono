---
name: Known working workflows
description: User journeys confirmed working via Playwright visual tests
type: project
updated: 2026-04-05
---

## Route map
- `/` — Main editor: two-column shell with AssetBrowserPanel (left), PreviewSection (center/right), TimelinePanel (bottom)

## Confirmed working workflows (as of 2026-04-05, updated 2026-04-05)

### 1. App shell load
- Navigate to `/`
- Expect: ClipTale Editor title in TopBar, left panel with asset browser, center with preview player, bottom with timeline ruler
- Status: CONFIRMED WORKING

### 2. Asset Browser Panel
- Left panel at `/` shows: All/Video/Audio/Image filter tabs, search box, asset cards, Upload Assets button
- Asset cards show filename, type label, status badge (Ready = green, processing = amber)
- Transcribe button appears below card when asset status is ready and type is video or audio
- Status: CONFIRMED WORKING

### 3. AssetCard TypeIcon (no thumbnail)
- When asset.thumbnailUri is null, a 24x24 SVG icon appears centered in the 48x48 thumbnail placeholder
- Video: play triangle (filled #8A8AA0), data-testid="type-icon-video"
- Audio: music note (stroked #8A8AA0), data-testid="type-icon-audio"
- Image: mountain+sun (stroked #8A8AA0), data-testid="type-icon-image"
- File: document (stroked #8A8AA0), data-testid="type-icon-file"
- When thumbnailUri IS set, no icon renders (img element used instead)
- Status: CONFIRMED WORKING (visual harness test + code review)

### 4. Timeline Panel
- Bottom panel at `/` shows ruler with timecodes, "No tracks — add a track to get started" when empty
- Zoom controls (- 4.0 px/f +) visible in toolbar
- Playhead needle (red, 1px) at frame 0
- Status: CONFIRMED WORKING

### 5. Preview Player
- Center panel shows Remotion player area (black when no clips)
- Playback controls: skip-to-start, prev-frame, play/pause (purple), next-frame
- Frame counter "0 / 300" and timecode "00:00:00:00"
- Status: CONFIRMED WORKING

### 6. TopBar
- "ClipTale Editor" title on left
- "Not yet saved" dot indicator, History button, Export button (disabled when no version)
- Status: CONFIRMED WORKING

### 8. Remotion preload (usePrefetchAssets)
- Navigate to `/` — PreviewPanel mounts, calls usePrefetchAssets(streamUrls)
- Expect: no JS errors, player container renders, play button clickable, frame counter advances on play
- With no assets: streamUrls is empty, usePrefetchAssets returns empty map, player renders empty composition (black canvas)
- With assets: stream URLs would be passed immediately; blob URLs replace them when prefetch resolves
- Status: CONFIRMED WORKING (2026-04-06)

### 7. Project init flow (dynamic projectId)
- Navigate to `/` with NO `?projectId=` param — app calls `POST /projects` API, gets a UUID, writes it to URL via `history.replaceState`, then renders editor normally
- Navigate to `/?projectId=<uuid>` — app skips `POST /projects`, uses existing ID, editor renders normally
- Each fresh load (no param) creates a new unique UUID
- In React StrictMode (dev), `POST /projects` is called twice (StrictMode double-invoke) but the URL ends up with exactly one valid projectId — this is expected behavior
- Status: CONFIRMED WORKING (2026-04-05)
