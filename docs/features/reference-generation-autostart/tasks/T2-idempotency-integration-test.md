---
id: T2
title: "Backend integration test — idempotent start returns existing job (QG-3)"
layer: tests
deps: ["T1"]
acs: ["AC-05", "AC-07"]
files_hint:
  - "apps/api/src/services/storyboardReference.extraction.service.test.ts"
  - "apps/api/src/controllers/storyboardReference.controller.test.ts"
owner: "Oleksii (Storyboard squad)"
estimate: "S"
status: "todo"
---

# T2 — Backend integration test: idempotent start (QG-3)

## Why

[QG-3](../sad.md) (one-extraction-per-draft) demands proof the invariant holds against the real datastore, not just at the unit seam — [ADR-0001](../adr/0001-idempotent-cast-extraction-start.md) is the correctness mechanism for the "0 duplicate extractions" NFR (spec §6). [data-model.md §Test fixtures](../data-model.md) prescribes the existing cast-extraction job seam (real MySQL, `singleFork: true`, never mocked).

## What

Add integration coverage over the now-idempotent `startExtraction`:
- Seed a draft (owner `user-<uuid>@example.test` per the PII guard), call `startExtraction` twice, assert the second call returns the **first** job's `id` and that the row count for the draft stays **1** (AC-05 / QG-3).
- Assert a `running` and a `completed` latest job are each returned idempotently (no new row).
- Assert a `failed` latest job triggers a fresh `queued` job (AC-07 — the never-started/failed recovery path).
- Reuse the existing API integration-test harness and cast-extraction insert path; no new fixture builder.

## Definition of Done

- [ ] Integration test runs against real MySQL via the existing harness and passes.
- [ ] Duplicate-call assertion: same `jobId` returned, `storyboard_cast_extraction_jobs` row count for the draft == 1.
- [ ] `failed`-latest assertion: a new `queued` job is created.
- [ ] Test seeds use `user-<uuid>@example.test`; no mocks of the repository layer.

## Notes

- Pairs with T1 (same backend lane); these are the QG-3 proof rows referenced in sad §10.
- Backend gate runs from `apps/api` (per repo gate realities — frontend vitest runs from `apps/web-editor`).
