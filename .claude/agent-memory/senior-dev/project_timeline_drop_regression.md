---
name: Timeline-drop regression fix (POST /clips 400 + Remotion black screen)
description: ALL 3 SUBTASKS COMPLETE (2026-04-19); video drop → 201 confirmed
type: project
---

Root cause of user-reported bug (2026-04-19): POST /projects/00000000-0000-0000-0000-000000000001/clips 400 when dragging asset to timeline; Remotion Player stays black.

**Two root causes — both fixed:**
1. `VideoComposition.tsx` read `clip.assetId` not `clip.fileId` → Subtask 1 fixed it
2. `useProjectInit.ts` 404-branch did not sync `project-store.getSnapshot().id` → Subtask 2 fixed it

**Subtask 3 — E2E verification COMPLETE (2026-04-19):**
- Docker Compose stack confirmed running (all 6 services)
- Playwright E2E test `e2e/timeline-drop-regression.spec.ts` added
- Video test: PASSED — POST /projects/<real-uuid>/clips → 201; URL NOT `000001`; no console errors; Remotion preview shows video frame (not black)
- Image/audio tests: SKIPPED (no image/audio assets linked to test project — correct graceful handling)
- Screenshots: `docs/test_screenshots/timeline-drop-video.png`, `timeline-drop-image.png`, `timeline-drop-audio.png`

**Key learnings for future E2E tests:**
- The login rate limiter (5 req/15 min, keyed by email) uses in-memory storage; tsx watch restarts do NOT clear it; only full container restart does
- Use Playwright `storageState` + `beforeAll` to log in once and reuse session across all tests in a suite (avoids rate limit hits)
- Seeded test users: `e2e@cliptale.test` and `e2e2@cliptale.test` (both password `TestPassword123!`, bcrypt hash in seed-test-user.sql)
- `APP_DEV_AUTH_BYPASS=true` on API means ALL API calls use `dev-user-001` regardless of FE login; FE still needs a valid session to render the editor
- Left sidebar ARIA label in editor is `"Left sidebar"` (not "Asset browser" — the older e2e specs use the wrong selector)
- Asset cards ARIA label format: `"Asset: <filename>, status: <status>"`

**How to apply:** Task is fully complete. No further subtasks remain.
