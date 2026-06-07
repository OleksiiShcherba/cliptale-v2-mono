# Changelog — storyboard-reference-flows

## storyboard-reference-flows — per-character & per-environment reference flows replace the single principal image

**What:** The storyboard reference phase no longer produces one principal image that anchors every scene. Instead, cast extraction reads the script and the Creator's already-uploaded images and proposes the characters and environments of the draft. After **one collective cost confirmation**, each confirmed cast entry becomes a **reference block** linked 1:1 to its own auto-created, fully editable generation flow; the first generation auto-starts in a rolling concurrency window. The Creator **stars** the best results (the primary star becomes the block preview), and scene-preview generation is **gated** until every reference block has ≥1 star — then the scene-generation master picks references per scene, strictly within the reference boundary (only blocks linked to that scene). Blocks can be opened/iterated from the canvas, manually added, scene-linked, retried on failure, and deleted; the draft carries a badge derived from its block↔flow links.

**Why:** One image can't carry the identity of several characters and locations, so the same character drifts visually scene to scene and Creators burned paid scene regenerations chasing consistency. This curates references **before** the expensive scene pass, so iteration happens on cheap single references. See [spec](../spec.md) §1–§2. Load-bearing decisions:
- [ADR-0002](../adr/0002-cast-extraction-on-storyboard-plan-queue.md) — cast extraction runs on the storyboard-plan queue (routed by job name).
- [ADR-0003](../adr/0003-db-state-rolling-window-with-worker-completion-hook.md) — DB-state rolling window advanced by a worker completion hook.
- [ADR-0004](../adr/0004-per-run-charging-under-collective-confirmation.md) — collective confirmation covers only the first run; later regenerations charge per generate.
- [ADR-0011](../adr/0011-star-gate-in-api-service-at-generation-start.md) — the star gate is enforced in the API service at scene-generation start.
- [ADR-0007](../adr/0007-style-description-from-starred-results-at-generation-time.md) — the scene style description is derived from starred results at generation time.

**How to use:** New REST surface under the storyboard draft (see [openapi.yaml](../contracts/openapi.yaml)):
- `POST .../cast-extraction` → propose cast; `POST .../confirm` → one collective confirmation that creates blocks + auto-starts flows.
- `GET .../references/blocks` → blocks with `stars`, `previewFileId`, `sceneBlockIds`.
- `POST .../blocks` (rate-limited, `429 flow.rate_limited`), `PUT .../blocks/{id}/scene-links` (`422 references.scene_not_in_draft` for out-of-draft scenes), `POST .../blocks/{id}/retry`.
- `POST/DELETE .../blocks/{id}/stars/{fileId}` → star/unstar (cross-tenant file rejected via `assertFileInFlow`).

**Operational notes:**
- Migrations: `052_create_storyboard_cast_extraction_jobs`, `053_create_storyboard_reference_blocks`, `054_create_storyboard_reference_scene_links`, `055_create_storyboard_reference_stars`, `056_add_truncated_to_cast_extraction_jobs` — applied on deploy; each ships a paired `.down.sql` and reverts cleanly. Already promoted into `apps/api/src/db/migrations/`.
- Worker: the storyboard-plan queue now branches on `job.name` — `cast-extract` → `processCastExtractJob`, everything else → `processStoryboardPlanJob`. No new queue/worker process to register.
- Feature flag / config: none.
- Rollback: revert migrations 056→052 (`*.down.sql`) and revert the deploy. Existing principal-image drafts are untouched (non-goal: no backfill) and continue under their old data until reference generation is next run.

**Acceptance criteria delivered:** AC-01, AC-01b, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-08b, AC-09, AC-10, AC-10b, AC-11, AC-12, AC-13, AC-14, AC-14b — traced end-to-end across api / media-worker / web-editor / e2e in review rounds 1–3 ([_review/review-2026-06-07-r3.md](../_review/review-2026-06-07-r3.md) — PASS).
