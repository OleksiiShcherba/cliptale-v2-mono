---
name: Confirmed working user workflows
description: User journeys confirmed working via Playwright E2E tests in the ClipTale web editor
type: project
---

All confirmed at http://localhost:5173 as of 2026-04-07.

## Desktop Layout (viewport >= 768px)
- App loads, creates new project, shows TopBar + Asset browser (left) + Preview (center) + Timeline (bottom)
- Asset browser: All/Video/Audio/Image filter tabs, search bar, empty state, Upload button
- Upload button opens dropzone modal; modal has Browse Files button; closes via close or Cancel
- Preview player: Remotion player renders, Play button present, timecode display, scrubber, frame counter
- Timeline: empty state "No tracks — drag a media file here to get started"
- "+ Track" button in timeline toolbar opens dropdown: Video/Audio/Caption/Overlay
- Selecting a track type creates a named track (e.g., "Video 1")
- Volume control: speaker icon + purple slider + percentage label; mute/unmute toggle

## Mobile Layout (viewport < 768px) — PARTIALLY CONFIRMED, HAS KNOWN BUG
- At 375px: vertical stack (TopBar → preview → playback controls → inspector tabs → content area → timeline → bottom bar)
- MobileInspectorTabs: 3 tabs (Assets/Captions/Inspector) with aria-selected switching correctly
- MobileBottomBar: Add Clip / AI Captions / Export buttons
- Tab switching works functionally but emits React console errors (shorthand/non-shorthand border conflict)
- Desktop two-column layout correctly absent at 375px and 767px
- Mobile layout correctly absent at 1440px (desktop shown instead)

## Route Map
- `/` — main editor page (only route)
- All features are on the single-page editor

## Existing Playwright E2E Test Suite
- 19 tests in apps/web-editor/e2e/: app-shell.spec.ts, asset-manager.spec.ts, preview.spec.ts
- All 19 pass consistently (as of 2026-04-07)
- Tests use 1440x900 desktop viewport by default
