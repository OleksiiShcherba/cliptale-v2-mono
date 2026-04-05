---
name: Ruling: styles object camelCase naming in component files
description: module-level `styles` / `style` objects in component files use camelCase, not UPPER_SNAKE_CASE — treat as warning not violation because the pattern is established across the codebase and was accepted in prior reviews
type: project
---

Component files (e.g. `ClipBlock.tsx`, `WaveformSvg.tsx`) declare a module-level `styles` or `style` constant using camelCase, not `UPPER_SNAKE_CASE` as §9 requires for module-level constants.

**Why:** This pattern appeared in `ClipBlock.tsx` (reviewed and approved in Epic 6) and was never flagged. Flagging the same pattern in newly extracted sibling files like `WaveformSvg.tsx` would be inconsistent with the established precedent. The `styles` object functions as a configuration record, and the codebase has consistently treated it as exempt from the `UPPER_SNAKE_CASE` rule.

**How to apply:** When reviewing component files, do not flag `const styles = {...}` or `const style = {...}` as a §9 violation. Note it as a warning at most if the file is brand new and has no precedent. Do not flag in files that follow the pattern already set by `ClipBlock.tsx`.
