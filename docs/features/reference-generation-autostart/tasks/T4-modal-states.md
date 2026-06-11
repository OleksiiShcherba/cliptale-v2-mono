---
id: T4
title: "Modal states — in-progress / proposal-ready / completed-empty"
layer: ui
deps: ["T3"]
acs: ["AC-03", "AC-04", "AC-06"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/CastConfirmModal.tsx"
  - "apps/web-editor/src/features/storyboard/components/CastConfirmModal.test.tsx"
owner: "Oleksii (Storyboard squad)"
estimate: "S"
status: "todo"
---

# T4 — Cast confirmation modal: state-driven bodies

## Why

Inside the dialog wrapper (T3), the modal must read the extraction state and present the right body ([sad §6 Flow 3](../sad.md); AC-03, AC-06) while preserving the single consent gate (AC-04). Today there is no distinct **completed-empty** state — empty-complete falls through to a confusing "review proposal" with zero entries.

## What

In `CastConfirmModal.tsx`, drive the body off `extraction.status` / proposal:
- **in-progress** (`queued` / `running`): "cast is being prepared", **no confirm action** (AC-03). A `completed` extraction exits this state whether or not it proposed a cast.
- **proposal-ready** (`completed` + non-empty proposal): show the proposal + aggregate cost estimate and enable the confirm action — the confirm action is the **only** path that proceeds to paid generation (AC-04, consent gate). No other state shows a confirm.
- **completed-empty** (`completed` + empty/`null` proposal): a distinct "nothing to generate references for" surface with a **close action and no confirm** (AC-06, spec §1¶4). Empty-complete counts as *ready*, not still-in-progress.
- Keep the existing `failed` body (close-only) inside the wrapper.

## Definition of Done

- [ ] in-progress state renders the "being prepared" body with no confirm button (AC-03).
- [ ] completed-empty renders the distinct "nothing to generate references for" body, close-only, no confirm (AC-06).
- [ ] proposal-ready renders proposal + cost and is the only state exposing the confirm action (AC-04).
- [ ] `CastConfirmModal.test.tsx` covers all three states; vitest (from `apps/web-editor`) passes; no new type errors in changed files.

## Notes

- Shares `CastConfirmModal.tsx` with T3 (same lane); depends on the wrapper landing first.
- Hard rule: the confirm action must never appear outside proposal-ready — AC-04 single-consent-gate invariant.
