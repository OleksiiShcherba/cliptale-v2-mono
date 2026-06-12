---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-12"
feature_size: "L"
ticket: "storyboard-generation-pipeline"
---

# 0007 — Guarantee single-active-run via an active-run marker plus a version CAS

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Tech Lead, Architect (Socratic walk)

## Context

A repeated confirm, a double trigger, or a second open tab must not start a duplicate run or create a duplicate set of reference blocks (AC-14, §6 NFR: 0 duplicate reference-block sets; §6.1 abuse case: spam re-trigger). Observer tabs (ADR-0004) make concurrent triggers a normal occurrence, so idempotency is the guard that makes the no-lock model safe.

## Decision drivers

- AC-14: idempotent re-trigger / double-confirm; continue or return the existing run.
- §6 NFR: 0 duplicate reference-block sets created.
- Reuse existing repo patterns: `storyboard_music_generation_jobs.active_lock` (partial-unique single-active marker) and `storyboard_reference_blocks.version` (CAS guard).

## Considered options

1. **Active-run marker + version CAS** — a partial-unique active-run marker on the `storyboard_pipeline` row (only one active run per draft+phase) plus a `version` column CAS'd on every transition; concurrent triggers collapse to the existing run.
2. **Client-supplied idempotency-key header** + a dedup table.
3. **Redis advisory lock** per draft+phase.

## Decision outcome

**Chosen:** Option 1. It reuses two patterns already proven in the storyboard schema (`active_lock`, `version`), keeps the guard co-located with the authoritative state row (ADR-0002), and needs no new client contract. Option 2 introduces a new client responsibility (generating/persisting keys) and a dedup table absent from the repo. Option 3 splits authoritative state between Redis and MySQL and adds a lock-TTL failure mode.

## Consequences

**Positive**
- The guard lives on the same row read for resume — one source of truth.
- Reuses idioms developers already know in this codebase.

**Negative**
- Every transition is a CAS that can lose the race and must retry-or-return-existing — the transition service must handle the conflict path explicitly.

**Neutral**
- The marker also naturally encodes "a run is in flight," used by the phase-order guards (AC-08, AC-15).

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §8
- Related ADR: [[0002-single-pipeline-state-row-per-draft]], [[0004-resume-by-single-state-read-with-observer-tabs]]
