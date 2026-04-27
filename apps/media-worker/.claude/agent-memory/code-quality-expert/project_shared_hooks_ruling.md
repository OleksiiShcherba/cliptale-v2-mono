---
name: shared/hooks/ folder ruling
description: Architecture gray area — shared cross-feature hooks placed in shared/hooks/ not defined by spec
type: project
---

The architecture-rules.md §3 defines `shared/components/` and `shared/utils/` under `apps/web-editor/src/shared/` but does NOT define `shared/hooks/`. The `useWindowWidth.ts` hook was placed in `shared/hooks/` because it is cross-feature (no single feature owns it). This was treated as a **warning**, not a violation.

**Why:** §6 says reusable UI logic should live in `features/[name]/hooks/`, but a pure viewport-width hook that drives the app-level layout switch doesn't belong to any one feature. The spec has a gap here.

**How to apply:** Flag `shared/hooks/` placement as ⚠️ warning (architecture gap), not ❌ violation, until architecture-rules.md is updated to explicitly address cross-feature shared hooks. Do not require moving the hook to a specific feature's hooks/ directory.
