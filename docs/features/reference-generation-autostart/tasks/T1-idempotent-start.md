---
id: T1
title: "Make startExtraction idempotent per draft + widen StartExtractionResult.status union"
layer: app
deps: []
acs: ["AC-01", "AC-05", "AC-07"]
files_hint:
  - "apps/api/src/services/storyboardReference.extraction.service.ts"
  - "apps/api/src/controllers/storyboardReference.controller.ts"
owner: "Oleksii (Storyboard squad)"
estimate: "M"
status: "todo"
---

# T1 — Make `startExtraction` idempotent per draft + widen the status union

## Why

The feature's one irreversible, multi-module decision: [ADR-0001](../adr/0001-idempotent-cast-extraction-start.md). Auto-start fires on every Step-2 entry (spec §1¶4), and React 18 StrictMode double-invokes mount effects, so several near-simultaneous starts can hit the same draft — today each creates a duplicate job row. The "0 second-extractions per draft" invariant ([spec §6 NFR](../spec.md), AC-05) must hold at the datastore boundary, not in client memory.

## What

In `storyboardReference.extraction.service.ts`:
- Before creating a job, call the **existing** `findLatestCastExtractionJobForDraft` and inspect the latest job's `status`:
  - **no job, or latest is `failed`** → create + enqueue as today, return `{ jobId, status: 'queued' }` (`failed` = not-existing, a fresh start is allowed — CONTEXT glossary "Idempotent start").
  - **latest is `queued` / `running` / `completed`** → return that job's `{ jobId, status }` and insert **no** second row.
- Widen `StartExtractionResult.status` from the literal `'queued'` to the union `'queued' | 'running' | 'completed'` (ADR-0001 §Consequences; mirrors `contracts/openapi.yaml` `ExtractionStartResult`). No new field.
- The `CastAlreadyExtractedError` blocks-guard stays unchanged and still wins (409) when confirmed reference blocks already exist (spec OQ-3 strict no-op).
- In `storyboardReference.controller.ts`: the status passthrough already returns `result.status` at 202 — confirm it compiles against the union, and **remove the now-unreachable `isExtractionInProgress` 409 branch** (the service no longer throws it; idempotent return supersedes it). Keep the 202 contract and the `CastAlreadyExtractedError` 409 branch.

## Definition of Done

- [ ] Unit test: a second `startExtraction` for a draft whose latest job is `queued`/`running`/`completed` returns the **same** `jobId` and does **not** call `createCastExtractionJob`/`enqueueCastExtract` again.
- [ ] Unit test: a `startExtraction` whose latest job is `failed` (or none) creates a new job and returns `status: 'queued'`.
- [ ] `StartExtractionResult.status` is the `'queued' | 'running' | 'completed'` union; controller returns 202 with that body shape.
- [ ] The dead `ExtractionInProgressError` 409 branch is removed; `CastAlreadyExtractedError` 409 path unchanged.
- [ ] No new type errors in the changed files; backend vitest for the touched service/controller passes.

## Notes

- Reuses `findLatestCastExtractionJobForDraft` (`storyboardReference.repository.ts`) — **no schema change, no new index** ([data-model.md](../data-model.md): `idx_storyboard_cast_extraction_draft_created` already serves the lookup).
- Hard rule: this is a *pre-insert existence check only* — do not touch proposal logic (spec §3 non-goal).
- Shares no files with the frontend lane; runs in parallel with T3/T4/T5. T2 depends on this task.
