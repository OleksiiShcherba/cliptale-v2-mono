---
name: 2026-04-21 follow-up batch verification anchors
description: Post-fix anchors for Guardian-flagged 13 test failures closed on feat/editor-asset-fetch-and-generate-fix
type: project
---

Follow-up batch on branch `feat/editor-asset-fetch-and-generate-fix` (test-only cleanup closing 13 test regressions from the prior pass).

**Fact:** All 13 previously-flagged failures are resolved. Class A/C pre-existing failures are narrower than the Known Issues list claims — `renders-endpoint.test.ts` now passes (10/10), so only `versions-list-restore-endpoint.test.ts` (1 failed test) + `assets-finalize-endpoint.test.ts` + `assets-list-endpoint.test.ts` remain as pre-existing Class A/C.

**Why:** The orchestrator drove 3 test-only subtasks (S1 FE placement, S2 BE scope-param draft-half, S3 BE generation-draft-ai-generate cast). S3's production fix was applied by qa-reviewer during S2's review as commit `667ab82` (cross-lane but harmless); S3's senior-dev verified and closed the log-entry gap.

**How to apply:**
- Test-only diffs: verify via `docker exec -w /app/apps/api cliptale-v2-mono-api-1 npx vitest run src/__tests__/integration/<file>` (NOT from `/app` root — importmap issue with `@/config.js`).
- FE verification: `docker exec -w /app/apps/web-editor cliptale-v2-mono-web-editor-1 npx vitest run` works from either root or `/app/apps/web-editor` cwd.
- If another batch claims "Class A reduced", independently grep-verify with a targeted run — the Known Issues section in development_logs.md can drift behind reality.
- §9.7 cap verified: placement=135L, test=264L, linkfile=136L, fixtures=43L, scope-param=297L, draft-ai-generate=289L — all ≤300.
- All three modified FE files share identical `vi.hoisted` + `vi.mock('@tanstack/react-query')` pattern — if a fourth split file is added, copy this pattern verbatim (vi.hoisted blocks cannot be shared across test files per Vitest + `singleFork: true`).
- Uncommitted tree: all three test fixes remain uncommitted on this branch (only `38e3d6e` + `667ab82` committed); orchestrator defers commit to the user.

**Current full-suite numbers (2026-04-21 run):**
- apps/api integration: 49/52 files green, 450/460 tests green (1 failed test + 3 failed files = pre-existing Class A/C; 2 `it.todo`).
- apps/web-editor: 194/194 files, 2176/2176 tests green.
- apps/media-worker: 15/15 files, 143/143 tests green.
