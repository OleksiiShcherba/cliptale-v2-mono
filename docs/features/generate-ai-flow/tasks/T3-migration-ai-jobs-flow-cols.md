---
id: T3
title: "Stage migration 048 — add nullable flow_id/block_id + index to ai_generation_jobs"
layer: "migration"
deps: []
acs: ["AC-08b"]
files_hint: ["docs/features/generate-ai-flow/migrations/03_add_flow_columns_to_ai_generation_jobs.up.sql", "docs/features/generate-ai-flow/migrations/03_add_flow_columns_to_ai_generation_jobs.down.sql"]
owner: "Backend Lead"
estimate: "S"
status: "todo"
---

# T3 — Stage migration 048: ai_generation_jobs flow back-links

## Why

Two nullable back-link columns let a job map to the flow + result block that triggered it, so reattach-on-reopen can find each result block's job state. Derives from [data-model.md §ai_generation_jobs ALTER](../data-model.md), [ADR-0001](../adr/0001-reuse-ai-generate-job-pipeline-for-flow-generation.md), [spec §AC-08b](../spec.md). Mirrors the existing `draft_id` pattern (migration 026) — no FK.

## What

Promote the staged `03_add_flow_columns_to_ai_generation_jobs.up.sql` / `.down.sql` to live `048_ai_jobs_flow_id.sql`. Add `flow_id` CHAR(36) NULL `AFTER draft_id`, `block_id` CHAR(36) NULL `AFTER flow_id`, and `idx_ai_generation_jobs_flow_id (flow_id)`. **No FK** (orphan-safe). The ALTER is `INFORMATION_SCHEMA` + `PREPARE/EXECUTE`-guarded (idempotent, matching 026/029); `.down` drops the index then the two columns.

## Definition of Done

- [ ] Staged 03 up/down promote to live `048_*` and apply cleanly
- [ ] Both columns nullable, no FK; `idx_ai_generation_jobs_flow_id` present
- [ ] Re-running the up is a no-op (guarded); `.down` reverts; up→down→up clean
- [ ] lint + vet clean

## Notes

No dep on T1/T2 — independent ALTER — but `implement` serializes all migration-layer tasks into one ordered lane regardless.
