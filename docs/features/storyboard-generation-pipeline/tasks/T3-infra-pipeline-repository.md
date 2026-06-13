---
id: T3
title: "Implement the storyboard_pipeline repository (row + CAS + stuck query)"
layer: "infra"
deps: ["T1", "T2"]
acs: ["AC-05", "AC-12", "AC-14"]
files_hint:
  - "apps/api/src/repositories/storyboardPipeline.repository.ts"
owner: "Backend"
estimate: "M"
status: "todo"
---

# T3 — Implement the storyboard_pipeline repository

## Why

The transition decisions (T2) need durable persistence on the one row (T1): the resume read (AC-05), the active-run CAS (AC-14) and the stuck-phase age scan (AC-12). Derives from [data-model §Access patterns](../data-model.md), [ADR-0002](../adr/0002-single-pipeline-state-row-per-draft.md), [ADR-0005](../adr/0005-release-stuck-phases-via-lazy-read-and-reaper.md).

## What

Raw parameterized `mysql2` repository (no ORM, per convention) with:
- `getByDraftId` — single-row PK lookup (the resume read, p95 ≤ 300 ms);
- `insertFresh` — create the row for a new draft (defaults from the column DEFAULTs);
- `applyTransition` — write a new sub-state + `active_run_phase` + `payload_json` + heartbeat with a **`version` CAS** (`WHERE version = ?`), returning whether the CAS won;
- `claimRun` / `clearRun` — set/clear `active_run_phase` under CAS (AC-14);
- `touchHeartbeat` — update `heartbeat_at` on per-unit progress;
- `findStuck` — `WHERE active_run_phase IS NOT NULL AND heartbeat_at < NOW(3) - INTERVAL ? MINUTE` (served by `idx_storyboard_pipeline_active_heartbeat`).

## Definition of Done

- [ ] Integration tests against **real MySQL** (`singleFork`) assert: insert+read round-trip, a winning vs. losing `version` CAS, run claim rejected when already claimed, and `findStuck` returns only over-bound rows.
- [ ] Uses the fixtures from [data-model §Test fixtures](../data-model.md) (`insertPipelineRow`, `insertStuckPhase`, …) inline per repo convention.
- [ ] lint + vet clean.

## Notes

- Imports the decision logic from T2; this task owns only persistence + the CAS SQL.
- The ownership gate (AC-13) is **not** here — it lives in the controller (T9), hitting `generation_drafts.user_id`.
