---
id: T13
title: "Extend media-worker to honor jobs.flow_id (link on success, single result, integrity)"
layer: "app"
deps: ["T7"]
acs: ["AC-08", "AC-09", "AC-12", "AC-13", "AC-14"]
files_hint: ["apps/media-worker/src"]
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T13 — media-worker honors flow_id

## Why

Result integrity lives at the worker: a library asset must appear **iff** the generation succeeds, exactly one result per Generate, and a failed/empty run must surface a retry — not a broken asset. Derives from [sad §4 strategic choice 1 / §6 Flow 8 / §8 Result integrity](../sad.md), [ADR-0001](../adr/0001-reuse-ai-generate-job-pipeline-for-flow-generation.md), [ADR-0007](../adr/0007-link-flow-results-to-library-via-flow-files-pivot.md), [spec §AC-08/09/12/13/14](../spec.md).

## What

In the `apps/media-worker` `ai-generate` handler: when the job carries `flow_id`, on **success** write the `files` row (existing `setOutputFile`) **and** the `flow_files` link (T7 `link`, idempotent), keeping the **first** output and discarding extras (single result per Generate, AC-14); publish completion on the existing realtime channel. On **failure/empty**, mark the job failed and write **no** asset / **no** link, publishing a failed state with a plain-language reason (AC-09). Image/video/audio handled by the existing capability routing — no new modality code.

## Definition of Done

- [ ] On success: exactly one `files` row + one `flow_files` link; extras discarded
- [ ] On failure/empty: zero assets, zero links, a published failed state with a reason
- [ ] The flow-link path is additive — non-flow (`flow_id IS NULL`) jobs are unchanged
- [ ] Worker integration test asserts the asset-iff-success reconciliation and single-link
- [ ] lint + vet clean

## Notes

Depends on T7 (`link`). Reuses the existing retry/backoff + dead-letter config — `tasks`/`data-model` flagged confirming the existing `jobId` idempotency key prevents double-charge on redelivery (sad §6 "Flagged for downstream").
