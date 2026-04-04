---
name: Recurring violation: type keyword used for Props shapes
description: Dev uses `export type FooProps = {...}` instead of `export interface FooProps {...}` for React component prop shapes
type: feedback
---

Dev repeatedly writes `export type XxxProps = { ... }` for React component prop shapes instead of `export interface XxxProps { ... }`.

Arch rules §9 is explicit: "Use `interface` only for React component prop shapes, suffixed with `Props`". All existing components in the codebase use `interface` for props (verified across AssetCardProps, CaptionEditorPanelProps, RestoreModalProps, etc.).

Seen in: `SaveStatusBadge.tsx` line 15 and `TopBar.tsx` line 18 (Task 2 re-review, 2026-04-04).

**Why:** The rule is unambiguous; `interface` is mandatory for component prop shapes per §9.
**How to apply:** Any `*Props` type declared with the `type` keyword is a §9 violation. Always flag it as ❌.
