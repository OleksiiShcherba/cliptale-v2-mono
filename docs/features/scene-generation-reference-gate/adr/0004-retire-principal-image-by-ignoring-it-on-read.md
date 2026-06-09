---
status: Accepted
owner: "Oleksii (Storyboard squad)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-09"
feature_size: "M"
ticket: "scene-generation-reference-gate"
---

# 0004 — Retire the principal image by ignoring it on read, defer row migration

- **Status:** Accepted
- **Date:** 2026-06-09
- **Deciders:** Oleksii (Storyboard squad), Tech Lead

## Context

Scene generation today consumes one up-front principal image (`storyboard_illustration_references`,
migration 040) as the global reference, approved via the principal-image modal. With per-cast
selected reference outputs (ADR-0003) now feeding scenes, the principal image is redundant. The
question is how to retire it without requiring a data migration to ship the behaviour.

## Decision drivers

- US-07 / AC-08: the principal-image step is gone from the Creator's path; readiness is decided solely by the Reference-done gate.
- AC-08: a pre-existing legacy principal-image record must be ignored on read — it never feeds a scene and never affects the gate.
- spec §8 OQ-1: the row-level fate of legacy records (drop / backfill / ignore) is owned by `data-model`, not required for this behaviour.

## Considered options

1. **Ignore-on-read at runtime** — the scene path stops generating, approving, and reading the principal image; legacy rows are ignored at gate/selection time; no data migration in this feature.
2. **Drop the rows now** — delete `storyboard_illustration_references` via a migration in this feature.
3. **Keep the principal path in parallel** — leave principal generation/consumption alongside per-cast references.

## Decision outcome

**Chosen:** Option 1. Ignore-on-read delivers AC-08's runtime behaviour without coupling this
feature to a schema migration. Option 2 pre-empts spec §8 OQ-1, which explicitly assigns the
row-level migration decision to `data-model`. Option 3 contradicts US-07's single-track goal.
The legacy rows are inert: read paths skip them, the gate ignores them.

## Consequences

**Positive**
- Single-track readiness for the Creator (US-07); no migration risk in this feature.
- Decouples behaviour from the deferred data decision.

**Negative**
- Legacy `storyboard_illustration_references` rows linger until `data-model` decides their fate — dead data carried in the meantime (accepted as §11 debt + OQ).

**Neutral**
- Removing the principal generation/approval code paths is in scope; the table DDL is not touched here.

## Links

- Spec: [[../spec.md]] §4 US-07, §5 AC-08, §8 OQ-1
- SAD: [[../sad.md]] §4, §11
- Related ADR: [[0003-feed-each-linked-block-a-single-selected-reference-output]]
