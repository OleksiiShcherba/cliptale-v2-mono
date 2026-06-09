---
status: Accepted
owner: "Oleksii (Storyboard squad)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-09"
feature_size: "M"
ticket: "scene-generation-reference-gate"
---

# 0003 — Feed each linked block a single selected reference output

<!-- Supersedes storyboard-reference-flows ADR-0008 (select scene references as each linked block's
     primary star, topped up to model capacity). Reduces multi-candidate-per-block to exactly one. -->

- **Status:** Accepted
- **Date:** 2026-06-09
- **Deciders:** Oleksii (Storyboard squad), Tech Lead

## Context

The inherited scene-generation master selected references per scene as each linked block's primary
star plus secondary stars topped up to the model's reference capacity — multiple candidate images
per block. With per-cast reference flows now producing complete outputs and starring demoted from
a gate to a selector, the question is how many images per linked block reach a scene, and how the
one (if one) is chosen.

## Decision drivers

- CONTEXT "Selected reference output": exactly one output per linked block reaches a scene; a ready+linked block is never reference-less.
- AC-06: a linked ready block with no starred result feeds the deterministic default.
- AC-06b: a primary starred result feeds the scene only if it is a completed usable output, else selection falls back to the default — never to an empty reference.
- clarify (2026-06-09): the deterministic default is the **latest completed output** (pinned in AC-06).

## Considered options

1. **One output, primary→latest** — primary star if it is a completed usable output, otherwise the latest completed output of the block.
2. **Keep multi-candidate** — primary + secondary stars topped up to model capacity (the inherited ADR-0008 behaviour).
3. **One output, default = earliest completed** — single output but the no-star default is the earliest, not latest.

## Decision outcome

**Chosen:** Option 1. CONTEXT fixes "exactly one output per linked block", which excludes Option 2.
Between the single-output defaults, clarify resolved the deterministic default to the *latest*
completed output, which excludes Option 3. The primary-star-if-usable rule honours the Creator's
explicit pick while the latest-completed fallback guarantees a ready+linked block is never fed an
empty reference (AC-06b).

## Consequences

**Positive**
- Deterministic, never-empty selection; the Creator's star is honoured when usable (QG-1).
- Simpler worker payload — one file per linked block instead of a candidate list.

**Negative**
- Less creative variety than the multi-candidate model — accepted as §11 debt; starring still controls *which* output.

**Neutral**
- The selection still runs strictly inside the Reference boundary — only outputs of blocks linked to the scene (ADR carries the boundary unchanged from the predecessor).

## Links

- Spec: [[../spec.md]] §4 US-05/US-06, §5 AC-05/AC-06/AC-06b
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-gate-on-persisted-reference-output-existence]]; supersedes storyboard-reference-flows ADR-0008
