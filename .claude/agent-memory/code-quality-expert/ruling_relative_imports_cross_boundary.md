---
name: Relative imports crossing directory boundaries
description: Policy decision on ../types and similar cross-boundary relative imports observed in features/
type: project
---

Relative imports that cross directory boundaries (e.g., `from '../types'` from a components/ folder to feature-root types.ts) violate §9 of architecture-rules.md, which states:

> "Relative imports that cross directory boundaries (e.g. `../../config.js`) are **forbidden**; only same-folder relative imports (e.g. `./ClipBlock`) are allowed."

However, this pattern is widespread across the codebase (observed in home/, generate-wizard/, and other features).

**Ruling:** Flag as a violation in code review per §9. This is not a gray area — the rule is explicit. The prevalence in the codebase suggests either:
1. The rule was added after earlier code was written and not retroactively enforced
2. The rule is not being consistently applied

**How to apply:** Always flag `from '../types'` and similar cross-boundary relative imports as violations when found in new code. The fix is simple: use the absolute alias `from '@/features/[name]/types'` instead.

**Why:** Absolute imports make it clear which feature or package owns the module, improve IDE navigation, and reduce fragility if folder structure changes.
