---
name: Formatter functions in component files are a §5 violation
description: Pure data-formatting helpers (formatFileSize, formatDuration, getTypeLabel) placed inside a component .tsx file violate §5 — must live in shared/utils/ or a feature-local utility file
type: project
---

In EPIC 7 subtask 5 review, `AssetDetailPanel.tsx` contained `formatFileSize`, `formatDuration`, and `getTypeLabel` defined as module-level functions in the component file. These are data transformation functions — §5 explicitly forbids data transformations in React components. They must be moved to `shared/utils/` (if reusable) or to a co-located `utils.ts` in the feature folder (if feature-local).

**Why:** §5 defines "data transformations" as business logic that must never live in `features/*/components/*.tsx`. The component file must contain only hook calls and JSX.

**How to apply:** Flag any non-trivial function defined in a `.tsx` component file that is not a React event handler or a JSX helper that returns `React.ReactElement`. Pure formatters/calculators belong in utility files regardless of how simple they are.
