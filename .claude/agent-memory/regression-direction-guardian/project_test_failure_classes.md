---
name: API integration test failure classes in ClipTale
description: Three distinct failure clusters exist in apps/api integration tests; guardian must classify them separately not conflate
type: project
---

The apps/api Vitest integration suite typically reports ~48 failing tests out of ~865. These split into THREE distinct classes that must be triaged separately:

**Class A — DEV_AUTH_BYPASS (~23 tests, genuinely pre-existing):**
- Pattern: `expected 200|201|202|409|500 to be 401`
- Cause: `APP_DEV_AUTH_BYPASS=true` lets requests through without a valid JWT, so tests that expect 401-on-missing-token see the endpoint's real response instead
- Files commonly affected: `versions-list-restore`, `versions-persist`, `versions-latest`, `assets-endpoints`, `assets-finalize`, `assets-list`, `assets-stream`, `renders-endpoint`, `clip-patch-endpoint`
- Ruling: can legitimately be called "pre-existing"; fix = either remove these tests, gate them on bypass flag, or add a no-bypass harness

**Class B — DB schema drift (~14 tests, NOT pre-existing, varies per batch):**
- Pattern: `Field 'project_id' doesn't have a default value`, `Data truncated for column 'capability'`, `expected 500 to be 202`
- Cause: migrations in the repo not fully applied to the live Docker DB (see project_migration_reliability.md)
- Files commonly affected: `aiGeneration.service.integration`, `ai-generation-endpoints`, `ai-generation-audio-endpoints`, `generation-draft-ai-generate`
- Ruling: these ARE regressions; must be called out and not folded into "pre-existing"

**Class C — Stale test code after a refactor (~11 tests + ~20 suite-blocked):**
- Pattern: `Unknown column 'asset_id' in 'field list'`, `Cannot read properties of undefined` on INFORMATION_SCHEMA lookups
- Cause: Batch 1 files-as-root refactor renamed `asset_id` → `file_id` across caption_tracks and project_clips_current; some tests still seed old schema
- Files commonly affected: `migration-002.test.ts`, `projects-list-endpoint.test.ts` (beforeAll fails, blocks 13 tests), `assets-delete-endpoint.test.ts` (beforeAll fails, blocks 7 tests)
- Ruling: these are refactor-debt from a previous batch; point them at the responsible batch's owner to patch

**Why:** During the Batch 2 review (2026-04-19), the senior-dev log claimed 48 failures were "unchanged pre-existing bypass failures" — that was only ~half true. Conflating the three classes hid real regressions that broke the new POST /generation-drafts/:draftId/ai/generate happy path.

**How to apply:** When running `vitest run` on apps/api, triage every failing test into one of these three classes before deciding whether the batch is healthy. The TOTAL count being "unchanged" across batches is not evidence of health if the COMPOSITION has shifted.
