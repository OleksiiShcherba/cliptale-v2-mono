---
name: Known working workflows
description: All confirmed working user journeys in ClipTale web editor, verified by Playwright
type: project
---

## Confirmed working as of 2026-04-05

### 1. Editor shell loads (route: /)
- Navigate to http://localhost:5173/
- App renders: TopBar ("ClipTale Editor", History, Export), asset browser panel (left), Remotion preview player (center, large black canvas + playback controls), timeline ruler + empty lane (bottom)
- No s3:// errors, no ERR_UNKNOWN_URL_SCHEME
- Empty project state: "No tracks — add a track to get started"

### 2. Asset browser panel
- Shows seeded asset "Oleksii_00002.mp4" with type "Video" and "Ready" badge
- Filter tabs: All, Video, Audio, Image
- Search box present
- "Transcribe" button visible for video assets in Ready state
- "+ Upload Assets" button visible at bottom

### 3. Remotion preview player
- Large preview area (black canvas when no clips) visible center-right
- Playback controls: skip-to-start, step-back, play/pause, step-forward
- Frame counter (e.g. "0 / 300")
- Timecode display ("00:00:00:00")
- Seek bar/scrubber

### 4. Timeline panel
- Ruler with timecodes at bottom
- Playhead needle (red, 1px)
- Zoom controls (- / px/f / +)
- Track count display
- Empty state: "No tracks — add a track to get started"

### 5. TopBar
- "ClipTale Editor" title
- "Not yet saved" / save status badge
- "History" button
- "Export" button (disabled when no version saved)

### 6. Stream endpoint (API)
- GET /assets/:id/stream → 404 for missing asset (route exists)
- In dev mode auth auto-passes (DEV_USER), so 404 means route is registered and working
- Browser never receives s3:// URIs — video src is always http://localhost:3001/assets/:id/stream

**Why:** These are all features confirmed working across epics 1–7. Used as regression baseline.
**How to apply:** Run all of these checks on every Playwright review run to catch regressions.
