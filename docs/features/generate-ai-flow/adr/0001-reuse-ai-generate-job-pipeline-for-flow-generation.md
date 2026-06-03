---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-03"
feature_size: "L"
ticket: "generate-ai-flow"
---

# 0001 — Reuse the ai-generate job pipeline for flow generation

- **Status:** Accepted
- **Date:** 2026-06-03
- **Deciders:** Architect + Tech Lead (Socratic walk)

## Context

A flow's per-block Generate must run an AI model asynchronously, report progress to the browser, and persist the result into the user-scoped library. ClipTale already has exactly this path: the `ai-generate` BullMQ job → `media-worker` (fal.ai submit/poll/download + ElevenLabs) → S3 upload → `files` row → `ingest` → realtime `ai.job.updated`. The decision is whether flow generation reuses that path or runs on a new dedicated queue (sad §4 pillar 1).

## Decision drivers

- Cost-safety (spec §1 QG-1): one audited spend path is easier to cap and reconcile than two.
- Durability across async (spec AC-08b): the existing pipeline already supports reattach-on-reopen via `useJobPolling` + a `GET /ai/jobs/:id` snapshot.
- Effort + consistency: no new worker container; `media-worker` already branches on `capability` for fal vs ElevenLabs.

## Considered options

1. **Reuse `ai-generate`** — extend `AiGenerateJobPayload` with a flow linkage (`flowId`/`blockId`); enqueue/consume/progress/persist unchanged.
2. **New `flow-generate` queue + handler** — a dedicated BullMQ queue and worker branch for flow generation.

## Decision outcome

**Chosen:** Option 1. The reattach, progress, S3, and library-write machinery is exactly what flow generation needs; duplicating it in a new queue would fork the submit/poll/ingest logic and create two spend paths to audit. The flow linkage is carried as additional payload fields plus a nullable `ai_generation_jobs.flow_id` (see [[0007-link-flow-results-to-library-via-flow-files-pivot]]).

## Consequences

**Positive**
- One spend path → one place to enforce the rate limit + reconcile charges vs library writes (NFR result integrity).
- Reuses the proven reattach flow for AC-08b with no new realtime code.

**Negative**
- Flow generation is coupled to the shared payload shape; a future flow-only need (e.g. multi-output, an excluded non-goal) forces a payload change that ripples to the wizard.

**Neutral**
- The worker stays `capability`-routed; flows add no new provider branch.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: [[0007-link-flow-results-to-library-via-flow-files-pivot]]
