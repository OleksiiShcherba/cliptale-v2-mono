---
name: Monorepo package imports misplaced in test files
description: In test files, @ai-video-editor/* package imports (group 3) are written after @/ absolute imports (group 4) — a recurring §9 import-ordering violation
type: project
---

In `useClipDeleteShortcut.test.ts` (flagged 2026-04-05) and again in `useDropAssetToTimeline.test.ts` and `useDropAssetWithAutoTrack.test.ts` (flagged 2026-04-06), `@ai-video-editor/*` imports appear after `@/` imports, reversing groups 3 and 4. The correct order is: external packages (group 2) → monorepo packages (group 3) → app-internal absolute imports (group 4) → relative imports (group 5).

A second variant appeared in `ingest.job.test.ts` (flagged 2026-04-06): when no group 4 is present, group 3 (`@ai-video-editor/*`) and group 5 (relative `./`) are written back-to-back with no blank line separator. §9 requires a blank line between every group regardless of whether intermediate groups are absent.

**Why:** Developers tend to add monorepo type imports as an afterthought alongside app-internal imports, conflating `@ai-video-editor/*` (workspace packages, group 3) with `@/` aliases (app-internal, group 4). When no `@/` imports exist, the missing-blank-line issue between group 3 and group 5 goes unnoticed.

**How to apply:** In every test file review, check that any `@ai-video-editor/*` import appears in its own group 3 block, separated by a blank line from both the group-2 external-package block above and the next non-empty group below (group 4 or group 5).
