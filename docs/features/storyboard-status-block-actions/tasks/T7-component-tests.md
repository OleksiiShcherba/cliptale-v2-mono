---
id: T7
title: "Component + integration tests for the status-menu feature"
layer: "tests"
deps: ["T6"]
acs: ["AC-02", "AC-04", "AC-05", "AC-06", "AC-07", "AC-08", "AC-09"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/StoryboardStatusMenu.test.tsx"
  - "apps/web-editor/src/features/storyboard/components/StoryboardRegenerateConfirmModal.test.tsx"
  - "apps/web-editor/src/features/storyboard/components/StoryboardPlanControls.test.tsx"
  - "apps/web-editor/src/features/storyboard/hooks/useStoryboardHiddenBlocks.test.ts"
owner: "Frontend Eng"
estimate: "M"
status: "todo"
---

# T7 — Component + integration tests

## Why

Lock the acceptance behaviour at the component/hook level so regressions surface in CI. Derives from [spec §5 ACs](../spec.md) and [sad §10 quality scenarios](../sad.md). Follows the existing Vitest + Testing-Library suites in the storyboard feature (e.g. `PrincipalImageApprovalModal.test.tsx`, `StoryboardPage.plan.test.tsx`).

## What

Add Vitest component/hook tests covering:

- **StoryboardStatusMenu:** returns null for non-owner (AC-09); keyboard operability — reveal on focus, Tab/Enter/Space/Escape (QG-2).
- **StoryboardRegenerateConfirmModal:** enumerates only present losses (AC-08); Cancel/Escape/backdrop are no-ops, Confirm fires once (AC-05).
- **StoryboardPlanControls (both blocks):** menu only in completed state (AC-06); no Ref box on completed illustration block for any viewer (AC-04).
- **useStoryboardHiddenBlocks:** single-block hide + sibling stays + re-show on new cycle, session-only (AC-02).
- **Workspace integration:** scene Regenerate gated by modal then `planGeneration.retry`; illustration Regenerate calls `start` with no modal; rapid double Regenerate starts exactly one generation (AC-07).

## Definition of Done

- [ ] All listed assertions pass under the project's Vitest runner.
- [ ] Tests use existing factories / `*@example.test` identities for any user (PII guard, data-model.md).
- [ ] Suite is green and added to the storyboard feature test set; lint clean.

## Notes

- E2E + axe accessibility are owned by **T8** (separate lane under `e2e/`); keep this task at the component/integration level.
- Reuse `useStoryboardIllustrations.test-utils.ts` / `useStoryboardPlanGeneration.test-utils.tsx` for generation-hook stubs.
