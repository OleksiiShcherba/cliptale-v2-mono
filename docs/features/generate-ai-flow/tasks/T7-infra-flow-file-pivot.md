---
id: T7
title: "Implement flow-file pivot repo + ai_generation_jobs flow back-link methods"
layer: "infra"
deps: ["T2", "T3"]
acs: ["AC-08b", "AC-19"]
files_hint: ["apps/api/src/repositories/flow-file.repository.ts", "apps/api/src/repositories/aiGenerationJob.repository.ts"]
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T7 — flow-file pivot repo + ai-job flow back-links

## Why

Two persistence touchpoints behind the result→library linkage and reattach: the `flow_files` pivot (so a result asset outlives its flow, AC-19) and the `ai_generation_jobs` flow back-link reads/writes (so reopening a flow can list each result block's job state, AC-08b). Derives from [data-model.md §flow_files + §ai_generation_jobs ALTER + Indexes](../data-model.md), [ADR-0007](../adr/0007-link-flow-results-to-library-via-flow-files-pivot.md), [spec §AC-08b/19](../spec.md).

## What

- `apps/api/src/repositories/flow-file.repository.ts`: `link(flowId, fileId)` (`INSERT IGNORE` — orphan-safe), `softUnlinkByFlow(flowId)`, `listFilesByFlow(flowId)`. Mirrors `draft_files`.
- Extend `apps/api/src/repositories/aiGenerationJob.repository.ts`: write `flow_id`/`block_id` on job create; `listByFlow(flowId)` reading every result block's last-known state via `idx_ai_generation_jobs_flow_id`.

## Definition of Done

- [ ] Linking a result asset survives a flow soft-delete (the `files` row is RESTRICTed, the link is dropped) — covered by an integration test
- [ ] `listByFlow` returns the per-block job states a flow read needs for reattach
- [ ] `link` is idempotent (a redelivered job never double-links)
- [ ] Integration tests against real MySQL pass; lint + vet clean

## Notes

Depends on T2 (pivot table) + T3 (job columns/index). The worker (T13) calls `link` on success; the service (T8) reads `listByFlow` for the flow open.
