---
name: Subtask 1 (2026-04-21) — Project store reset — APPROVED
description: Store-layer hydration fix; zero UI surface, zero token changes; confirmed no regression risk
type: project
---

## Review Summary
**Subtask:** Add project-store / history-store reset + call from useProjectInit before hydration
**Status:** ✅ APPROVED (2026-04-21)
**Verdict:** YES — no design surface affected

## What was verified
- `resetProjectStore(projectId)` in `project-store.ts`: initializes empty ProjectDoc with given projectId, clears currentVersionId, notifies listeners. **No component/style changes.**
- `resetHistoryStore()` in `history-store.ts`: clears undo/redo stacks + accumulated patches, notifies listeners. **No component/style changes.**
- `useProjectInit.ts` hydration effect: calls both resets at line 117–118 before `fetchLatestVersion`. **No component surface changes.**
- New test files (`project-store.reset.test.ts`, `useProjectInit.project-switch.test.ts`, `useAutosave.reset.test.ts`): all test-only, zero style impact.

## Design review checklist
- ✅ No hardcoded colors or hex values introduced
- ✅ No typography changes
- ✅ No spacing/padding/margin changes
- ✅ No new components or component variants
- ✅ No style files modified (no `.styles.ts` or CSS touched)
- ✅ Zero token references in the modified code
- ✅ No design-guide.md violations

## Conclusion
Pure state-management refactor. No visual regression risk. Ready for next reviewer phase (QA/Playwright).
