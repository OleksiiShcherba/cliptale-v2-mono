---
id: T21
title: "Deploy cut-over: migrate in-flight old-flow drafts (OQ-2)"
layer: "docs"
deps: ["T9"]
acs: ["AC-05"]
files_hint:
  - "apps/api/src/db/cutover/storyboardPipelineBackfill.ts"
  - "docs/features/storyboard-generation-pipeline/migrations/"
owner: "Tech Lead"
estimate: "M"
status: "todo"
---

# T21 — Deploy cut-over: migrate in-flight old-flow drafts (OQ-2)

## Why

At cut-over the *Scene planning* / *Illustration status* statuses and their logic are retired (spec §1); drafts that are mid-old-flow with queued/running jobs must not be stranded — they must resume correctly under the new pipeline (AC-05). This is the resolution of spec §8 OQ-2 / [sad §11 OQ row](../sad.md). Default (carried from the spec): **drain or one-time-migrate** old jobs into the new state row before cut-over.

## What

A one-time cut-over (a backfill script + a runbook):
- enumerate drafts with in-flight old-flow jobs (queued/running scene-plan / cast-extraction / illustration);
- seed a `storyboard_pipeline` row for each that maps the draft's current real progress to the correct `active_phase` + sub-state (e.g. scenes done but no references → `reference_data` idle/awaiting per the cast state);
- drain or reconcile the queued/running jobs so they land in the new completion-hook path (T10), not the retired one;
- document the cut-over ordering (migrate T1 → deploy api/worker → run backfill → retire old statuses) in a short runbook.

## Definition of Done

- [ ] A **dry-run** against a dev DB snapshot shows every in-flight draft resolves to a valid pipeline state with **no orphaned jobs** and no draft stuck in the retired flow.
- [ ] The backfill is idempotent (safe to re-run) and logs a per-draft before/after mapping.
- [ ] The runbook documents ordering + rollback.

## Notes

- Reuses the dev-DB backfill pattern already used for the cast/reference pipeline migrations.
- Not a schema migration (T1 owns the DDL) — this is data + process; classified `docs` so `implement` does not serialize it into the migration lane.
