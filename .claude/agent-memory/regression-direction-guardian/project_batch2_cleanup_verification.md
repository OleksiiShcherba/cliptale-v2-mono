---
name: Guardian Batch-2 Feedback Cleanup verification anchors
description: Concrete post-batch invariants that must hold after the 2026-04-19 Files-as-Root cleanup batch; useful anchors for future reviews
type: project
---

The 2026-04-19 "Guardian Batch-2 Feedback Cleanup" batch delivered 7 subtasks against the Files-as-Root refactor. Snapshot of the verified end state so future batches don't have to re-derive it from diffs:

**Migration runner is live:**
- `apps/api/src/db/migrate.ts` is the only sanctioned DB mutation path. `docker-entrypoint-initdb.d` mount removed from `docker-compose.yml`.
- `schema_migrations` table on the live Docker DB lists 28 rows (000 bootstrap + 001-027) with SHA-256 checksums.
- Production safety gate: runner no-ops when `NODE_ENV=production && APP_MIGRATE_ON_BOOT !== 'true'`.

**Live DB schema post-migration (verified 2026-04-19):**
- `ai_generation_jobs.capability` ENUM has 8 values incl. `text_to_speech`, `voice_cloning`, `speech_to_speech`, `music_generation`.
- `ai_generation_jobs` has `output_file_id` and `draft_id` (both nullable char(36)); `project_id` and `result_asset_id` are absent.
- `project_assets_current` table is absent (migration 027 succeeded).

**Wire DTO rename complete:**
- `grep -r 'assetId' packages/api-contracts apps/api/src apps/web-editor/src` returns 0.
- `submitGenerationSchema` in `apps/api/src/controllers/aiGeneration.controller.ts` uses `.strict()` on line 20.
- `MediaIngestJobPayload` in `packages/project-schema/src/types/job-payloads.ts` is dual-optional (`fileId?` primary, `assetId?` legacy) — media-worker ai-generate path not yet migrated; documented under Known Issues.

**Why:** Future guardian reviews should be able to check these specific invariants directly via grep / DESCRIBE rather than re-reading the full dev log. If any of these flips, something has regressed.

**How to apply:** When reviewing the NEXT batch after this one, start by verifying these anchors still hold. A grep hit for `assetId` in non-test source is an immediate regression flag — the compat shim has been removed.
