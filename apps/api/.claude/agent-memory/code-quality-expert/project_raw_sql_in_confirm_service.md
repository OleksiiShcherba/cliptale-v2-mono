---
name: raw-sql-in-confirm-service
description: storyboardPipeline.confirm.service.ts has multiple raw pool.execute calls; only filterValidSceneIds was flagged in round 1; generation_flows INSERT flagged in round 2; pre-existing INSERTs not yet addressed
metadata:
  type: project
---

`apps/api/src/services/storyboardPipeline.confirm.service.ts` contains several raw SQL calls via `pool.execute()` that violate §5/§14:

- `assertDraftOwner` (line 87): `SELECT user_id FROM generation_drafts` — pre-existing, not yet flagged
- `INSERT INTO generation_flows` (line 213–217) — added in MAIN ADJ commit (705a766); flagged in round-2 review (2026-06-21)
- `INSERT INTO storyboard_reference_blocks` (line 219–224) — pre-existing, not yet flagged
- `INSERT IGNORE INTO storyboard_reference_scene_links` (line 245–250) — pre-existing, not yet flagged
- `INSERT INTO ai_generation_jobs` (line 266–271) — pre-existing, not yet flagged
- `UPDATE storyboard_reference_blocks SET first_job_id` (line 279–282) — pre-existing, not yet flagged

Round-1 only flagged `filterValidSceneIds` (SELECT FROM storyboard_blocks). Round-2 flagged the new `generation_flows` INSERT.

The sibling `storyboardReference.confirm.service.ts` (shipped, not code-reviewed in development_logs.md) also has raw SQL — so this is a codebase-wide pattern in confirm services that predates code-review coverage.

**Why:** §14 rule "All SQL goes in repositories" is explicit; confirm services are accumulating SQL without repository wrapping due to historical pattern from before code-review was established.

**How to apply:** Flag any new raw SQL in service files as §5/§14 violations. Pre-existing SQL in this service may need to be addressed in a dedicated cleanup task if the developer requests it; do not re-flag unchanged lines in future reviews of this file unless the task specifically touches those lines.
