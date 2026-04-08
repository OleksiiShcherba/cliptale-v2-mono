---
name: Known working workflows
description: User journeys confirmed working via Playwright visual tests
type: project
updated: 2026-04-07
regression-note: 2026-04-07 — RendersQueueModal feature broke the app; useListRenders called before QueryClientProvider in App.tsx; app blank on load; all prior workflows broken until fix lands. RESOLVED 2026-04-07: QueryClientProvider moved to main.tsx; app loads cleanly, all workflows confirmed working.
---

## Route map
- `/` — Main editor: two-column shell with AssetBrowserPanel (left), PreviewSection (center/right), TimelinePanel (bottom)

## Confirmed working workflows (as of 2026-04-05, updated 2026-04-07 regression run after commit 3bd8477)

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

### 9. ImageClipEditorPanel (image clip inspector)
- Upload test_image.png via Upload Assets UI:
  - Click "+ Upload Assets" button
  - Modal shows "Upload Assets" dialog with "Browse Files" button and "Done" button
  - Click "Browse Files" → file chooser opens → set file → upload starts automatically
  - Wait for "Ready" text badge (~3s for test image) → click "Done" to close modal
- After upload: asset card appears with type="Image" + "Ready" badge (green) + image thumbnail
- Asset card selector: `[role="button"][aria-label*="test_image"]` or `[role="button"][aria-label^="Asset:"]` fallback
- Click card → AssetDetailPanel opens with "ASSET DETAILS" header
- "Add to Timeline" button: use `page.locator('button', { hasText: 'Add to Timeline' })` (NOT getByRole — that can fail strict mode)
- Click Add to Timeline → clip block appears on timeline (selector: `[data-clip-id]`)
- Click clip → ImageClipEditorPanel appears at right sidebar: aside[aria-label="Inspector"] containing section[aria-label="Image clip editor"]
- Panel controls: Start frame input (aria-label="Start frame"), Duration input (aria-label="Duration in seconds") default=5, hint span "N frames @ X fps", Opacity input (aria-label="Opacity percentage")
- Close button: button[aria-label="Close image clip editor"] — clicking dismisses panel (inspector count drops to 0)
- Status: CONFIRMED WORKING (2026-04-06)

### 10. Filter tabs selector note
- Filter tab buttons: `button[aria-pressed]` with hasText name — use .first() to avoid strict mode violation
- Asset card `role="button"` with aria-label="Asset: <name>, status: <status>" also matches `getByRole('button', { name: 'Image' })` when card name contains "Image"
- Known flaky: `page.getByRole('button', { name: 'Image' })` without `.first()` raises strict mode error when an image asset card is in the DOM

### 11. Track drag-and-drop reordering + vertical scroll
- Add tracks: click "+ Track" button (text match), then select type from dropdown using `getByRole('menuitem', { name: 'Video' })` (NOT getByText — conflicts with asset browser filter tabs)
- After adding 3 tracks: drag handles appear (6-dot grip icon), each with aria-label="Drag to reorder track"
- Drag handle at x≈8 in viewport (left edge of timeline), y varies per track row (36px height as of 2026-04-07; was 48px)
- Drag handle test: `page.getByLabel('Drag to reorder track')` returns all handles; verified 3 for 3 tracks
- Reorder confirmed: drag handle 1 to handle 3 changes track order in DOM (Video 1 → Audio 1 position etc.)
- Vertical scroll: wheel event at x=80 (inside 160px track header column), y≈784 (middle of timeline at y=668+h/2); confirmed by different tracks visible after wheel(0, 150)
- Key selector: `getByRole('menuitem', { name: 'Video' })` (not getByText) to select track type from + Track dropdown
- Status: CONFIRMED WORKING (2026-04-06)

### 12. Undo/Redo buttons in TopBar
- Undo button: `button[aria-label="Undo"]` at x≈1119 in 1440px viewport, 28x28px
- Redo button: `button[aria-label="Redo"]` at x≈1151, 28x28px
- Both are `aria-disabled="true"` when history is empty; become enabled after any project change
- Full undo cycle: add track → click Undo → 0 tracks → click Redo → 1 track restored
- Confirmed WORKING with visual screenshots 2026-04-07

### 13. ClipContextMenu portal fix
- `ClipContextMenu.tsx` uses `createPortal(menu, document.body)` — NOT rendered in react-window container
- Unit tests: `container.querySelector('[role="menu"]')` is null; `document.body.querySelector('[role="menu"]')` is not null
- Cannot E2E-trigger context menu without a real uploaded+ready asset and a clip on the timeline
- When clip exists: right-click → `[role="menu"]` appears directly in BODY, not inside FixedSizeList
- Menu items: "Split at Playhead" (disabled without overlap), "Delete Clip" (red), "Duplicate Clip"
- Status: CONFIRMED via code + unit tests (15/15 pass); E2E requires full media stack

### 14. Upload Assets button spacing consistency
- AssetBrowserPanel outer wrapper: `flex: 1, minHeight: 0` (computed: flexGrow=1, minHeight=0px)
- Upload button: `width: '100%'` — fills 296px in 320px panel (accounts for 12px padding each side)
- Spacing is consistent whether or not an asset is selected (outer flex fill ensures no layout shift)
- Selector: `button:has-text("Upload Assets")` — renders at y≈620 in default layout
- Status: CONFIRMED WORKING with visual screenshots 2026-04-07

### 15. Delete track button with confirmation dialog
- Add a track via "+ Track" → select type (Video/Audio/etc.) from dropdown
- Track header shows: drag handle, name, M (mute), L (lock), x (delete) buttons
- Delete button: `button[aria-label="Delete track"]` — visible on every track header
- Click delete button → opens DeleteTrackDialog confirmation (NOT immediate delete as of 2026-04-07)
- Dialog: role="dialog", title="Delete Track" (id=delete-track-title), warning banner (id=delete-track-desc) showing track name in bold
- Warning text: "Track **<name>** and all its clips will be removed from the timeline."
- Secondary text: "You can undo this action with Ctrl+Z or restore a previous version from Version History."
- Cancel button: aria-label="Cancel delete" — dismisses dialog, track stays
- Confirm button: aria-label="Delete track <name>" — deletes track, dialog closes
- Close X: aria-label="Close delete track dialog" — dismisses dialog without deleting
- After confirm delete: track removed, "No tracks — drag a media file here to get started" empty state reappears
- VISUAL BUG (noted 2026-04-07): DeleteTrackDialog rendered inside react-window virtualized list row (not via portal). The `position:fixed` overlay is affected by CSS transform on the row container — dialog is visually clipped to the timeline area, title/buttons partially outside viewport. Core functionality still works correctly.
- Status: CONFIRMED WORKING with visual screenshots 2026-04-07

### 16. RendersQueueModal (Renders in Progress)
- Click "Renders" button in TopBar (top-right, next to History and Export)
- Modal "Renders in Progress" opens with `role="dialog"`
- Empty state shows "No render jobs found for this project." when no jobs exist
- Close button ("×" top-right OR "Close" footer button) dismisses modal — `dialog count` drops to 0
- Renders button activates (highlighted purple border) when modal is open
- No badge appears when activeRenderCount is 0
- QueryClientProvider must wrap App at root (main.tsx) — if placed inside App.tsx return, useListRenders will crash with "No QueryClient set"
- Status: CONFIRMED WORKING (2026-04-07) after QueryClientProvider moved to main.tsx

### 17. Mobile preview layout fix (iPhone 14, 390x844)
- Navigate to `/` at 390x844 viewport (iPhone 14)
- Preview area (`<main>`) renders at y=48, height=259px (56.25vw + 40px = correct 16:9 ratio for 390px width)
- Remotion player shows black canvas (correct for empty project) — NOT overlaid by inspector tab panel
- Inspector tab bar (Assets/Captions/Inspector, `role="tablist"`) appears at y=307px — below the preview, NOT on top
- Tab switching confirmed: Captions shows "Select a caption clip to edit it"; Inspector shows "Select a clip to inspect it"; Assets returns full asset browser
- Timeline visible at y=480, height=232px below inspector area
- Bottom bar (Add Clip / AI Captions / Export) visible at very bottom
- `[data-remotion-canvas]` selector returns no match but the player renders correctly inside `<main>`; rely on `main` bounding box for presence check
- Root cause was mobileTabPanel being `position:absolute; zIndex:10` overlaying preview; fixed to normal flow
- Status: CONFIRMED WORKING with visual screenshots 2026-04-07

### 18. Scroll to beginning button on timeline
- Navigate to `/` — timeline toolbar shows only zoom controls (- 4.0 px/f +); NO "Scroll to beginning" button visible at default scroll position 0
- Zoom in significantly (click zoom-in 20+ times, reaches 100.0 px/f) to make timeline overflow viewport
- Drag scrollbar thumb (`role="scrollbar"[aria-orientation="horizontal"]`) rightward — timeline ruler advances to later timecodes
- After drag: "Scroll to beginning" button appears in toolbar (`[aria-label="Scroll to beginning"]`) — small SVG with double-bar + chevron-left icon on far-left of toolbar
- Click button → scrollOffsetX resets to 0 → ruler shows 00:00:00:00 again → button disappears
- Zoom level is preserved (100.0 px/f remains); only scroll position is reset
- Selector pattern: `page.locator('[aria-label="Scroll to beginning"]')` — count=0 at start, count=1 after scroll, count=0 after click
- Status: CONFIRMED WORKING with visual screenshots 2026-04-07

### 7. Project init flow (dynamic projectId)
- Navigate to `/` with NO `?projectId=` param — app calls `POST /projects` API, gets a UUID, writes it to URL via `history.replaceState`, then renders editor normally
- Navigate to `/?projectId=<uuid>` — app skips `POST /projects`, uses existing ID, editor renders normally
- Each fresh load (no param) creates a new unique UUID
- In React StrictMode (dev), `POST /projects` is called twice (StrictMode double-invoke) but the URL ends up with exactly one valid projectId — this is expected behavior
- Status: CONFIRMED WORKING (2026-04-05)

### 19. Multiple caption tracks (TranscribeButton stays enabled)
- Requires mocking API with CORRECT Asset shape: `contentType` (not `mimeType`), `downloadUrl` (not `streamUri`), plus `durationSeconds`, `width`, `height`, `fileSizeBytes`, `waveformPeaks`, `updatedAt` fields
- Mock endpoints: `GET /projects/:id/assets` (returns array), `GET /assets/:id/captions` (returns `{ segments: [...] }`), `GET /projects/:id/renders` (returns `[]`)
- Navigate with `?projectId=<mocked-id>` — app resolves instantly without calling POST /projects
- Asset card shows "Ready" badge and green "Add Captions to Timeline" button immediately (since captions API returns segments on mount)
- Click asset card → "ASSET DETAILS" panel opens with green "Add Captions to Timeline" button (enabled, not disabled)
- Click "Add Captions to Timeline" once → "Captions 1" track appears in timeline with TEXT-OVERLAY clips; preview shows caption text
- "Add Captions to Timeline" button remains green and enabled after click 1
- Click again → "Captions 2" track appears (now 2 tracks total); button still enabled
- KNOWN: console warning "Query data cannot be undefined" for renders-list query — cosmetic React Query strict warning, does not affect functionality
- Status: CONFIRMED WORKING (2026-04-07)

### 20. Replace File dialog (AssetDetailPanel)
- Select a ready asset card → AssetDetailPanel opens
- "Replace File" button is enabled (pointer cursor, TEXT_PRIMARY color) when `onReplace` prop is wired
- Clicking opens ReplaceAssetDialog (role="dialog") with: warning banner explaining clips affected + undoable, upload area, scrollable library list of ready assets
- Library list shows existing ready assets (excluding current); "Replace" button enabled only after selection
- Cancel button closes dialog without modifying any clips
- onReplaced callback fires after commit; old asset clips get new assetId via setProject (Immer, undoable)
- AssetBrowserPanel wires `isReplaceOpen` state → `onReplace={() => setIsReplaceOpen(true)}`
- Status: CONFIRMED WORKING (2026-04-07) — confirmed via prior test run with real asset

### 22. Timeline track height 36px (smaller rows)
- Track row height changed from 48px → 36px (as of 2026-04-07)
- `TRACK_ROW_HEIGHT = 36` is the authoritative constant in `trackHeaderStyles.ts`
- DOM measurement: `aria-label="Track row: *"` elements report height=36; React-window inline style `height: 36px` on 14+ elements
- 4 tracks fit visibly in the 900px viewport without scrolling (was 3 at 48px)
- Track controls (drag handle, M/L/delete) all still render and work correctly at 36px row height
- Status: CONFIRMED WORKING (2026-04-07)

### 26. Add to Timeline plain button when no matching track exists (2026-04-07)
- When no tracks of matching type exist: "Add to Timeline" button is plain (no ▾ arrow, no aria-haspopup)
- Clicking directly calls addAssetToNewTrack — no dropdown shown, track created immediately
- When ≥1 matching track exists: button shows "Add to Timeline ▾" (aria-haspopup="listbox"), dropdown opens on click
- Dropdown shows "To New Video Track" + "To Existing: <track-name>" options
- Test flow: upload video → click asset card → inspect button attributes → click → verify no dropdown, track appears
- Selectors: asset card `getByRole('button', { name: /asset:.*test_video/i })`, button `getByRole('button', { name: /add.*timeline/i })`
- Status: CONFIRMED WORKING (2026-04-07)

### 23. Add to Timeline dropdown with track selection
- "Add to Timeline" button in AssetDetailPanel replaced by a dropdown trigger (button with "▾" arrow indicator)
- Click trigger → listbox opens below; first option always "To New [Video|Audio] Track"
- Content-type routing: video/* and image/* → "Video Track"; audio/* → "Audio Track"
- When no tracks exist: only "To New Video Track" shown; "Existing Video Tracks" section absent
- When ≥1 matching track exists: dropdown shows divider + "EXISTING VIDEO TRACKS" label + "To Existing: [track name]" for each track
- Clicking "To New Video Track" → new track created, clip appended, dropdown closes
- Clicking "To Existing: [name]" → clip appended to that track (track count stays same), dropdown closes
- Outside click (mousedown outside wrapperRef) closes dropdown without selection
- aria-expanded on trigger reflects open/closed state; role="listbox" on panel; role="option" on items
- Status: CONFIRMED WORKING (2026-04-07)

### 21. Delete Asset dialog (AssetDetailPanel)
- Select a ready asset card → AssetDetailPanel opens
- "Delete Asset" button is enabled (error-red border, pointer cursor) when `onDelete` prop is wired
- Clicking opens DeleteAssetDialog (role="dialog", aria-modal=true, aria-labelledby=delete-asset-title)
- Dialog warning banner: filename shown, "Tracks that become empty...will also be deleted", "original file is not deleted", "Ctrl+Z or restore a previous version"
- Cancel button OR backdrop click closes dialog without deleting
- Confirm "Delete Asset" button calls deleteAsset(assetId) then onDeleted() — removes clips and empty tracks via setProject (Immer, undoable)
- AssetBrowserPanel wires `isDeleteOpen` state → `onDelete={() => setIsDeleteOpen(true)}`; onDeleted deselects asset
- Status: CONFIRMED WORKING (2026-04-07) — confirmed via prior test run with real asset

### 25. FPS and resolution controls (ProjectSettingsModal)
- "Settings" button in TopBar (aria-label="Toggle project settings", aria-pressed=false at rest)
- Clicking opens modal (role="dialog", aria-modal=true, aria-labelledby=project-settings-title)
- Modal title: "Project Settings"; close button (aria-label="Close project settings")
- FRAME RATE section label; 5 preset buttons (24/25/30/50/60 fps) with aria-pressed reflecting active state
- Default active FPS: 30 fps (aria-pressed=true on load); clicking any other preset switches highlight immediately
- RESOLUTION section label; 6 preset buttons: 1080p/720p/1440p/4K/Vertical/Square
- Each resolution button has platform subtitle: "YouTube (16:9)", "Shorts · TikTok (9:16)", "Instagram (1:1)"
- Default active resolution: 1080p; clicking switches highlight and updates project store (setProject called immediately)
- Clicking a preset triggers save status → "Unsaved changes" (confirms setProject fired)
- Backdrop click (data-testid="project-settings-backdrop") closes modal
- Close button click closes modal; Settings button aria-pressed returns to false
- Selecting Vertical preset adjusts preview area aspect ratio (portrait layout visible in player)
- Status: CONFIRMED WORKING (2026-04-07)

### 28. Remotion player pointer freezing fix — playhead sync on all control actions (2026-04-07)
- Play button: sets `isPlayingRef.current = true` synchronously before starting rAF loop (prevents stale-ref race)
- Pause button: sets `isPlayingRef.current = false` synchronously before calling stopRafLoop, then calls `updateTimelinePlayheadFrame(frame)` — frame counter AND timeline red line update immediately
- Rewind button (aria-label="Rewind to start"): frame counter shows "0 / 300", timeline playhead returns to far-left position; rewind from paused state also confirmed correct
- Step forward (aria-label="Step forward one frame"): frame counter advances from "0/300" to "1/300", timeline playhead moves right
- Step back (aria-label="Step back one frame"): frame counter returns from "1/300" to "0/300"
- Scrub slider (aria-label="Playback position"): clicking at ~25% shows frame "73/300" and timeline playhead advances to ~2 second mark
- All interactions: no console errors, no page crash
- Status: CONFIRMED WORKING (2026-04-07) with visual screenshots

### 27. AddToTimelineDropdown hover glitch fix + DeleteTrackDialog createPortal (2026-04-07)
- Hover behavior: `onMouseLeave` is on the dropdown panel container (not individual items); moving mouse between items does NOT reset hoveredItem until leaving the panel entirely
- Dropdown panel: `role="listbox"`, items `role="option"`; item 1 highlighted on hover, switches correctly to item 2 on fast move; all items de-highlight when mouse leaves panel
- DeleteTrackDialog portal: `createPortal(dialog, document.body)` in TrackHeader — DOM check confirms `dialog.parentElement === document.body` (isBodyChild=true, insideTrack=false)
- Dialog title id=delete-track-title, desc id=delete-track-desc; Cancel, confirm "Delete Track", X close, backdrop click all work
- Track is removed from timeline after confirm; "Not yet saved" → "Saved 2s ago" in header
- Status: CONFIRMED WORKING (2026-04-07)

### 24. Resizable timeline panel (TimelineResizeHandle)
- `[role="separator"][aria-label="Drag to resize timeline"]` renders between editorRow and TimelinePanel in desktop layout
- Handle: 4px height, full viewport width (1440px), cursor:ns-resize, background #252535 (BORDER token)
- Default timeline height: 232px (TIMELINE_PANEL_HEIGHT constant)
- Drag upward: increases timeline height; drag 100px up → timeline grows from 232→332px; preview area shrinks
- Drag downward: decreases timeline height; drag 200px down from 332 → 132px
- Min clamp: 80px — confirmed at exactly 80px after large downward drag
- Max clamp: 600px — confirmed at exactly 600px after large upward drag
- Mobile (390px viewport): handle NOT rendered (count=0 in DOM); mobile layout unchanged
- Active state color: #1E1E2E (surface-elevated token, updated from #3A3A4F per design review 2026-04-07)
- Drag uses pointer capture — stable even if pointer leaves the 4px strip
- Status: CONFIRMED WORKING (2026-04-07) — 10/10 checks pass
