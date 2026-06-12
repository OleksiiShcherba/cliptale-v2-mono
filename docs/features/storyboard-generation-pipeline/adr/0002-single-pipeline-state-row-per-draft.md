---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-12"
feature_size: "L"
ticket: "storyboard-generation-pipeline"
---

# 0002 — Represent pipeline state as a single denormalized row per draft

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Tech Lead, Architect (Socratic walk)

## Context

Given backend-owned orchestration (ADR-0001), the pipeline state must be read on every Step-2 open to reconstruct the screen (running loader or pending modal). No backend pipeline-state table exists today; per-job tables (`storyboard_plan_jobs`, `storyboard_cast_extraction_jobs`, `storyboard_reference_blocks.window_status`, `storyboard_scene_illustration_jobs`) hold per-unit progress but no unified draft phase.

## Decision drivers

- §6 NFR: pipeline-state read p95 ≤ 300 ms; availability 99.9%.
- The glossary requires `skipped` to be **distinct from `idle`** (a prerequisite check must tell an intentional skip from never-run) — that state has nowhere to live in the job tables.
- AC-14 single-active-run needs a single guarded row to CAS against.
- Repo convention: MySQL raw parameterized SQL, no ORM, no event store.

## Considered options

1. **Single denormalized `storyboard_pipeline` row per draft** — columns: `draft_id` (PK/FK), `active_phase`, per-phase sub-state, `payload_json` (loader label / pending-modal data), `version` (CAS), heartbeat/`phase_started_at`. Per-unit detail stays in the existing job/block tables.
2. **Derive state on-read** from the existing per-job tables — no new table.
3. **Event-sourced transition log** — current state is a fold over an append-only log.

## Decision outcome

**Chosen:** Option 1. A single indexed row answers the resume read in one cheap query (≤ 300 ms) and gives one place for the `skipped`≠`idle` distinction and the single-active-run CAS marker. Option 2 has nowhere to store `skipped` or the active-run guard and forces a multi-table join on every read. Option 3 is overkill for a synchronous single-draft machine and contradicts the raw-SQL, no-ORM convention.

## Consequences

**Positive**
- O(1) resume read; trivial to index and cache-free.
- Houses the `version` CAS (ADR-0007) and the heartbeat for stuck-release (ADR-0005).

**Negative**
- The state row is denormalized against the job tables — transitions must keep them consistent (owned by the transition service, ADR-0003).
- Deploy migration: in-flight drafts mid-old-flow must be seeded into a state row (→ §11 OQ).

**Neutral**
- No transition history kept; if an audit trail is later needed, an append-only side table can be added without changing the read path.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §5, §8
- Related ADR: [[0001-own-orchestration-in-backend-pipeline-state-machine]], [[0007-single-active-run-via-active-run-marker-and-cas]]
