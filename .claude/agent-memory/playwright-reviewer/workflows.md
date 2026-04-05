---
name: Known Working Workflows
description: Confirmed working user journeys in ClipTale editor, verified by Playwright screenshots
type: project
updated: 2026-04-05 (timeline sync bugs re-verified same date)
---

All workflows start at http://localhost:5173/ (single-page app, all features on one route).

## Workflow 1: View Editor Shell
- Navigate to /
- See: TopBar ("ClipTale Editor" title, "Not yet saved" badge, "History" button, "Export" button disabled)
- See: Asset browser sidebar (left), preview panel (center/right), timeline (bottom)
- See: Playback controls bar with play/pause, skip, scrubber, timecode "00:00:00:00"
- See: Timeline ruler canvas with time tick marks
- See: "No tracks — add a track to get started" empty state

## Workflow 2: View Asset in Asset Browser
- Navigate to /
- See: seeded asset "Oleksii_00002.mp4" with "Ready" badge in asset list
- See: filter tabs (All/Video/Audio/Image), search input
- Click asset row (click on filename text, NOT on any button)
- See: AssetDetailPanel slides in (right of asset list, ~280px wide)
- See: thumbnail preview area, filename, metadata (type/size/duration/resolution)
- See: "Add Captions to Timeline" (green, TranscribeButton in ready state = captions exist)
- See: "Ready" status badge, "Add to Timeline" (purple), "Replace File", "Delete Asset"
- NOTE: thumbnail image shows broken (S3 CORS not configured — known issue, expected)

## Workflow 3: Add Asset to Timeline
- Select asset → click "Add to Timeline" button
- See: "Video 1" track appears with M (mute) and L (lock) icon buttons
- See: Purple "VIDEO" clip block spans timeline
- See: Frame counter updates (e.g., "0 / 3230" for 107s video at 30fps)
- See: "1 track" counter in timeline toolbar updates
- See: TopBar badge changes to "Unsaved changes"

## Workflow 4: Version History Panel
- Click "History" button in TopBar
- See: "Version History" panel slides in on right with versions listed (v7-v12)
- See: Each version shows version number, relative timestamp, frame count, "Restore" button
- See: "×" close button in panel header
- Click "Restore" on any version → "Restore Version" modal appears
- See modal: "This will replace your current version with the version saved Xm ago. Any unsaved changes will be lost."
- See modal: "Version #N" label, "Cancel" and "Restore" (red) buttons

## Workflow 5: Save Status Badge States
- Initial load: "Not yet saved" (dot indicator)
- After adding clip: "Unsaved changes" (within ~500ms)
- After autosave completes (2s debounce): "Saved" expected
- On version conflict (concurrent edits): "Conflict — reload to get latest" (orange warning)

## Workflow 6: Export Button
- Export button in TopBar is DISABLED (greyed out) until currentVersionId is set (i.e., autosave has completed at least once)
- Once autosave completes → Export button becomes enabled
- Click Export → ExportModal opens with preset options (1080p, 720p, 4K)
- NOTE: In test env, conflict state prevents autosave, so Export stays disabled during automated tests

## Workflow 7: TranscribeButton / Captions
- AssetDetailPanel shows TranscribeButton which is a state machine
- States: "Checking…" → "Transcribe" (idle) → "Transcribing…" (pending/processing) → "Add Captions to Timeline" (ready) → "Captions Added" (added)
- Seeded asset already has captions → shows "Add Captions to Timeline" (green, #10B981)
- Clicking "Add Captions to Timeline" adds text-overlay clips to timeline

## Workflow 8: Timeline Empty State
- Without clips: "No tracks — add a track to get started" centered in track list area
- Timeline toolbar shows zoom controls (-/+ buttons with "4.0 px/f" display), track count "0 tracks"
- Timeline ruler canvas is always visible with time tick marks

## Workflow 9: Timeline Sync (Epic 6 Bug Fixes — verified 2026-04-05)
- Playhead needle: a 1px #EF4444 (rgb 239,68,68) absolutely-positioned div appears in `trackListWrapper` at `playheadFrame * pxPerFrame - scrollOffsetX + TRACK_HEADER_WIDTH`. At frame 0 it appears at left=160px (=TRACK_HEADER_WIDTH). It is hidden when outside lane bounds.
- Ruler click seek: clicking at x+300 on the ruler canvas moves needle to ~00:00:02:00 position; DOM needle jumps from left:160px to left:460px. `PreviewSection` useEffect calls `playerRef.seekTo(playheadFrame)` on `playheadFrame` changes.
- Scroll sync: wheel-scrolling 200px right on the ruler shifts both ruler timestamps AND clip block left value by -200px simultaneously (confirmed: `left: "0px"` → `left: "-200px"`).
- Scroll max clamping: after extreme scroll-right (10x wheel 500px = 5000px total) timeline clamps to end of content (~00:00:13-17 range for 107s video zoomed to 12.2 px/f). Body does NOT overflow viewport.
- Playback needle movement: pressing play button causes needle to advance rightward; at 1s left=224px, at 2s needle further right. The rAF tick in `usePlaybackControls.ts` calls `setPlayheadFrame` on each frame.
- Play button selector: `page.locator('button[aria-label*="lay"]').first()` — works initially but may timeout if the page state changes (stop action caused timeout in test 7). Use Space key as fallback.
