---
name: Stale vi.mock for @/lib/constants — RESOLVED 2026-04-05
description: Six test files had a no-op vi.mock('@/lib/constants') after DEV_PROJECT_ID was removed — flagged as §9 dead-code violation; all six mocks removed and re-review approved
type: project
---

After the project-init refactor (2026-04-05) removed `DEV_PROJECT_ID` imports from `useAutosave`, `useVersionHistory`, and `useExportRender`, six test files were left with stale `vi.mock('@/lib/constants', ...)` blocks. These were flagged as §9 dead-code violations and removed in a follow-up fix confirmed on 2026-04-05.

**Status:** RESOLVED — grep confirms zero occurrences of `vi.mock('@/lib/constants')` across all web-editor test files.

**Why:** Flagged because harmless no-ops still violate §9 dead-code rule.
**How to apply:** If `vi.mock('@/lib/constants')` reappears in any test file where constants is not imported by the code under test, flag immediately as a §9 violation — do not treat as pre-existing.
