---
name: Project: Telegram Bugs 2026-04-21 (3 bugs)
description: Three Telegram-reported regressions; branch fix/telegram-bugs-timeline-preview-storyboard; ALL 3 SUBTASKS COMPLETE (2026-04-21)
type: project
---

Branch: `fix/telegram-bugs-timeline-preview-storyboard`

**Bug 1 — Store leak between projects (DONE):**
- Added `resetProjectStore(projectId)` to `project-store.ts`
- Promoted `_resetForTesting` → `resetHistoryStore()` in `history-store.ts`
- `useProjectInit.ts` calls both resets before `fetchLatestVersion`
- 23 new tests across 3 new test files

**Bug 2 — Home-page thumbnails 401 (DONE):**
- `ProjectCard.tsx` + `StoryboardCard.tsx`: `buildAuthenticatedUrl` wraps thumbnailUrl in `<img src>`
- 6 new tests (3 per file)

**Bug 3 — AssetDetailPanel too narrow in wizard (DONE 2026-04-21):**
- `assetDetailPanel.styles.ts` → `getAssetDetailPanelStyles(compact: boolean)` factory. `compact=true`: root 280×620, children 248px. `compact=false`: root width 100%/maxWidth 520/minHeight 620, children 100%/maxWidth 480.
- `AssetDetailPanel.tsx`: `compact?: boolean` prop (default true), calls factory locally.
- `WizardAssetDetailSlot.tsx`: passes `compact={false}`.
- `generateWizardPage.styles.ts`: `rightColumn.padding` → `'24px'`.
- New tests: `getAssetDetailPanelStyles.test.ts` (21), `AssetDetailPanel.fluid.test.tsx` (11), `WizardAssetDetailSlot.test.tsx` (8) = 40 total new tests.
- All 38 existing `AssetDetailPanel.test.tsx` + `.draft.test.tsx` tests green.

**Why:** Files-as-Root batch regressions from 2026-04-20 batch.

**How to apply:** Task fully complete. active_task.md cleared of all subtasks.
