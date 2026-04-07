---
name: Styles companion file naming is a §9 violation
description: PascalCase.styles.ts is not a valid §9 naming pattern; utility/constants extraction must use camelCase.ts
type: project
---

`TimelinePanel.styles.ts` was flagged as a §9 naming violation. The file exports only constants (`PLAYHEAD_COLOR`, `TRACK_LIST_HEIGHT`, etc.) and a `styles` object. Because it contains no React component, it must follow the utility file rule: `camelCase.ts` with no suffix.

**Why:** §9 lists only two patterns for `.ts` files: `camelCase.ts` (utilities) with specific suffixes for service/repo/controller/route/schema files. `PascalCase.styles.ts` matches none of them.

**How to apply:** Any future styles-companion extraction file must be named in `camelCase` — e.g. `timelinePanelStyles.ts` — not `PascalCase.styles.ts` or `camelCase.styles.ts`. The `.styles.ts` suffix is not recognized by §9 regardless of whether the base is PascalCase or camelCase. Flag all occurrences as §9 violations. Second occurrence flagged 2026-04-07: `addToTimelineDropdown.styles.ts` in the asset-manager components folder.
