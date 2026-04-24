---
name: api-client is a fetch wrapper, not generated client
description: lib/api-client.ts is a hand-rolled fetch wrapper; packages/api-contracts generated client is not yet integrated — do not flag this as a Rule 8 violation
type: project
---

`apps/web-editor/src/lib/api-client.ts` is a hand-rolled `fetch` wrapper that adds base URL and auth headers. It is NOT the generated TypeScript client from `packages/api-contracts`. Architecture Rule 8 mentions "generated API client in `packages/api-contracts/`" but all feature `api.ts` files (asset-manager, captions) uniformly use this hand-rolled wrapper. This is the established codebase pattern.

**Why:** The `packages/api-contracts` generated client does not appear to be wired into the frontend yet. Every existing feature uses `apiClient` from `@/lib/api-client`. Flagging this would be flagging the entire codebase, not a new deviation.

**How to apply:** Do not flag `import { apiClient } from '@/lib/api-client'` as a Rule 8 violation. Only flag if a feature calls `fetch` directly, bypassing `api-client.ts` entirely.
