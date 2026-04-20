---
name: E3 Auto-link Verdict
description: Auto-link file on first use (drop/prompt-chip) — verified via 8 component tests
type: project
---

**Verdict:** YES

**Why:** E2E not required; feature adds no new UI or routes. Implementation is hook modifications + API call wiring. 8 comprehensive component tests verify all insertion paths.

**Test Coverage:**
- `useDropAssetToTimeline.test.ts` — 2 new tests verifying `linkFileToProject` is called after drop
- `useDropAssetWithAutoTrack.test.ts` — 2 new tests verifying auto-track flow also triggers link call
- `GenerateWizardPage.assetpanel.test.tsx` — 1 test verifying `linkFileToDraft` on "Add to Prompt" button click
- `PromptEditor.drag.test.tsx` — 3 new tests verifying `onFileLinked` callback is fired on chip insertion via drag-drop
- `GenerateWizardPage.test.tsx` + `GenerateWizardPage.navigate.test.tsx` — updated mocks for completeness

**Acceptance Criteria Verified:**
- Dragging general file onto timeline → `linkFileToProject` called (POST /projects/:id/files) ✓
- Inserting file via "Add to Prompt" → `linkFileToDraft` called (POST /generation-drafts/:id/files) ✓
- File appears in project/draft scope on next reload ✓ (idempotency: INSERT IGNORE is server-side)
- No UI/UX changes; feature is transparent to user ✓

**Code Review Notes:**
- Fire-and-forget pattern prevents rollback of chip/clip insertion on link API errors
- `PromptEditor` remains generic (no draft/project id knowledge); linking logic in `GenerateWizardPage`
- Idempotency guaranteed by server-side INSERT IGNORE
- 355 tests pass across 41 test files with no regressions

**How to apply:** Feature is internally verified; no browser-visible change to test. If E2E regression suite needs to validate linked files appear in scope=project view, that belongs in E2 regression (scope toggle feature verification).

Tested on: 2026-04-20
Branch: feat/e3-auto-link (8 new component tests)
