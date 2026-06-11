---
id: T3
title: "Refactor CastConfirmModal into a backdrop+centered dialog wrapper (every state)"
layer: ui
deps: []
acs: ["AC-02"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/CastConfirmModal.tsx"
  - "apps/web-editor/src/features/storyboard/components/CastConfirmModal.styles.ts"
  - "apps/web-editor/src/features/storyboard/components/CastConfirmModal.test.tsx"
owner: "Oleksii (Storyboard squad)"
estimate: "M"
status: "todo"
---

# T3 — `CastConfirmModal` backdrop+dialog wrapper

## Why

`CastConfirmModal` today returns bare `<div>`s in every branch — the no-extraction branch renders two unstyled buttons inline at the page bottom (the **stray-buttons defect**, spec §1¶1, US-02, AC-02). [sad §4 choice 4](../sad.md) + [§8 Modal/dialog](../sad.md): wrap it in the same inline-styled backdrop + centered dialog shell the `SceneModal`/`MusicBlockModal` precedent uses (no shared Modal primitive — repo convention).

## What

Reuse the `SceneModal.styles.ts` backdrop+dialog pattern (`position: fixed`, full-viewport backdrop, `zIndex: 1000`, centered dialog container):
- Add backdrop + centered dialog styles to `CastConfirmModal.styles.ts`.
- Wrap **every** return branch of `CastConfirmModal` (existing-blocks, in-progress, failed, no-extraction, completed) in the single dialog shell — no branch may render loose inline buttons.
- Dialog semantics: `role="dialog"` + `aria-modal`, focus-on-mount, Esc-to-close (calls `onCancel`), backdrop click closes — matching the `SceneModal` precedent.
- This task is the **structural wrapper only**; the distinct per-state bodies (in-progress / proposal-ready / completed-empty) are T4.

## Definition of Done

- [ ] Every modal state renders inside the backdrop+dialog shell; **0 stray-buttons** — no branch returns bare top-level buttons (AC-02 / QG-2).
- [ ] `role="dialog"`, focus moves into the dialog on mount, Esc and backdrop-click both invoke `onCancel`.
- [ ] `CastConfirmModal.test.tsx` updated: asserts the dialog wrapper is present in the no-extraction / in-progress states (previously bare).
- [ ] vitest (run from `apps/web-editor`) for `CastConfirmModal` passes; no new type errors in changed files.

## Notes

- Shares `CastConfirmModal.tsx` / `.styles.ts` with T4 → same `implement` lane; T4 depends on this task.
- Hard rule (sad §11): do **not** extract a shared `<Modal>` primitive — duplicate the wrapper per the current convention.
