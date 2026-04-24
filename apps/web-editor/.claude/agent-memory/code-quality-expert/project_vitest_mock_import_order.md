---
name: Vitest vi.mock + import * as ordering pattern
description: vi.mock hoisting in Vitest forces @/ imports after relative imports in test files — flag as §9 warning, not hard violation, and note the Vitest constraint
type: project
---

In test files that use `vi.mock(...)` followed by `import * as module from '@/...'`, the `@/` imports appear after the relative imports (lines importing the file under test). This violates the §9 import group ordering (external → monorepo → @/ → relative), but is mechanically required by Vitest's hoisting behavior: `vi.mock` must be declared in source before the `import *` that reads the mocked module.

**Why:** Vitest hoists `vi.mock()` calls at compile time. The `import * as` re-import after the mock declarations is the standard Vitest pattern for accessing mock internals — reordering would break mock wiring.

**How to apply:** Flag as ⚠️ warning (not ❌ violation) with a note that §9 does not provide an explicit Vitest exception. Request clarification or an explicit rule carve-out. Do not block approval on this pattern alone if no other violations exist.
