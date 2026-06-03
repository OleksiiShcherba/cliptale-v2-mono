---
id: T12
title: "Implement Generate enqueue — job + flow_files link + idempotency"
layer: "app"
deps: ["T7", "T9", "T10", "T11"]
acs: ["AC-01", "AC-12", "AC-13"]
files_hint: ["apps/api/src/services/flow-generate.service.ts"]
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T12 — Generate enqueue (job + link + idempotency)

## Why

The accept half of the spend path: once the gate (T11) and the rate limit (T10) pass, create the job with its flow back-links and enqueue the existing `ai-generate` pipeline — idempotently, so a double-submit or network retry never double-charges. Derives from [sad §4 strategic choice 1 / §6 Flow 1 & 7](../sad.md), [ADR-0001](../adr/0001-reuse-ai-generate-job-pipeline-for-flow-generation.md), [spec §AC-01/12/13](../spec.md), [openapi.yaml POST .../generate](../contracts/openapi.yaml).

## What

In `flow-generate.service.ts`, a `generate(flowId, blockId, userId, version, idempotencyKey)` that: re-checks the flow `version` (stale → `OptimisticLockError` 409); runs T11 `validate`; consumes the T10 rate limit (over-cap → typed 429 error); creates the `ai_generation_job` with `flow_id` + `block_id` (T7) and enqueues the BullMQ `ai-generate` job carrying the extended payload (T4); returns the existing accepted shape (`jobId`, `blockId`, `status: queued`). Idempotency: a repeated `Idempotency-Key` returns the first run's job (24h TTL) instead of enqueuing again. Image/video/audio all route through this one path.

## Definition of Done

- [ ] A passed gate + rate-limit creates exactly one job (flow_id, block_id) and enqueues one `ai-generate` job
- [ ] A repeated `Idempotency-Key` returns the first job, no second enqueue / no second charge
- [ ] Over-cap → the typed 429 error; stale version → 409 — both before any enqueue
- [ ] Integration tests cover accept, idempotent replay, rate-limit reject, and stale-version reject
- [ ] lint + vet clean

## Notes

Shares the `flow-generate.service.ts` lane with T9 + T11. The `flow_files` link is written by the worker on success (T13), not here — here only the job + its back-links are created. Pairs with the generate endpoint (T15).
