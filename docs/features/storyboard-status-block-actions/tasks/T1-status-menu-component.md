---
id: T1
title: "Build StoryboardStatusMenu presentational component (kebab + reveal + keyboard)"
layer: "ui"
deps: []
acs: ["AC-06", "AC-09"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/StoryboardStatusMenu.tsx"
  - "apps/web-editor/src/features/storyboard/components/StoryboardStatusMenu.styles.ts"
owner: "Frontend Eng"
estimate: "M"
status: "todo"
---

# T1 — Build StoryboardStatusMenu presentational component

## Why

The kebab (⋮) menu is the sole host of Regenerate + Hide. Derives from [sad §5](../sad.md) (new `StoryboardStatusMenu` building block), [ADR-0002](../adr/0002-owner-gate-status-menu-by-not-rendering.md) (owner-gate by not rendering), and the accessibility goal in [spec §6](../spec.md) / sad §1 QG-2.

## What

A new feature-local presentational component `StoryboardStatusMenu.tsx` + co-located `StoryboardStatusMenu.styles.ts` (inline `CSSProperties`, hardcoded tokens per repo convention). Props (pure — no generation logic here): `isOwner: boolean`, `onRegenerate: () => void`, `onHide: () => void`, plus a label/`data-testid` hint for the two blocks.

- Render **nothing** when `isOwner === false` (AC-09 — not in the DOM at all).
- Kebab trigger revealed on pointer hover **or** keyboard focus of the block; the trigger stays in the tab order so it is reachable without a pointer.
- Two menu items — Regenerate, Hide — keyboard operable: Tab to reach, Enter/Space to activate, Escape to close and return focus to the trigger.
- Reuse the kebab/⋮ glyph from `storyboardIcons.tsx` (add one only if none fits).

This task is **presentational only** — it does not decide *when* a block is completed (the caller passes the menu in only on the completed state — T4) and does not own the Regenerate/Hide behaviour (T6).

## Definition of Done

- [ ] Component returns `null` when `isOwner` is false — asserted by a component test (AC-09).
- [ ] Trigger is revealed on hover and on focus, is in the tab order, and the menu is operable by Enter/Space/Escape with focus returning to the trigger — asserted by a keyboard test (QG-2).
- [ ] `onRegenerate` / `onHide` fire on their respective items.
- [ ] lint + typecheck clean.

## Notes

- AC-06 (state gate) is satisfied jointly: this component is only handed to a block in its completed state by T4 — keep no "is in progress" logic here.
- Modal/focus-trap precedent for related a11y work: `PrincipalImageApprovalModal.tsx` (used by T2, not here).
