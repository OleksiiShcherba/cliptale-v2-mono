---
id: T2
title: "Build StoryboardRegenerateConfirmModal (focus-trap + Escape + loss enumeration)"
layer: "ui"
deps: []
acs: ["AC-05", "AC-08"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/StoryboardRegenerateConfirmModal.tsx"
  - "apps/web-editor/src/features/storyboard/components/StoryboardRegenerateConfirmModal.styles.ts"
owner: "Frontend Eng"
estimate: "M"
status: "todo"
---

# T2 — Build StoryboardRegenerateConfirmModal

## Why

Scene Regenerate is destructive, so it must be gated by a single confirmation that enumerates exactly the present losses. Derives from [spec §AC-05, §AC-08](../spec.md), [sad §5](../sad.md) (new `StoryboardRegenerateConfirmModal` block), [ADR-0001](../adr/0001-reuse-generation-start-path-gated-by-action-type.md), and quality goal QG-1 (sad §1).

## What

A new feature-local modal `StoryboardRegenerateConfirmModal.tsx` + co-located `StoryboardRegenerateConfirmModal.styles.ts`, following the `PrincipalImageApprovalModal.tsx` pattern (focus-trap + Escape). Props: `losses: Array<'scenes' | 'illustrations' | 'music'>` (the caller computes which presently exist — T6), `onConfirm: () => void`, `onCancel: () => void`.

- Render the warning body enumerating **only** the categories present in `losses` (absent categories omitted — AC-08).
- Confirm fires `onConfirm`; Cancel, Escape, and backdrop click all fire `onCancel` and close — `onCancel` is a pure no-op signal (AC-05).
- Focus is trapped while open and restored to the opener on close.

This task is **presentational only** — it does not compute the loss list and does not start generation (both T6).

## Definition of Done

- [ ] Renders exactly the passed-in loss categories and omits absent ones — component test (AC-08).
- [ ] Confirm → `onConfirm`; Cancel / Escape / backdrop → `onCancel`; nothing else triggers either — component test (AC-05).
- [ ] Focus is trapped while open and restored on close.
- [ ] lint + typecheck clean.

## Notes

- Mirror the focus-trap + Escape implementation already used by `PrincipalImageApprovalModal.tsx` to stay consistent (sad §2 Conventions).
- The "single confirmation dialog" wording (AC-08) means one modal, not a multi-step flow.
