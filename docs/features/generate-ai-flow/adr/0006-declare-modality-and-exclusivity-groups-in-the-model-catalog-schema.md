---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-03"
feature_size: "L"
ticket: "generate-ai-flow"
---

# 0006 — Declare input modality and alternative-exclusivity groups in the model-catalog schema

- **Status:** Accepted
- **Date:** 2026-06-03
- **Deciders:** Architect + Tech Lead (Socratic walk)

## Context

The canvas blocks incompatible connections at connect-time by modality (spec AC-02) and the API blocks a Generate when an "exactly one of two alternatives" rule is violated (spec AC-06). Today the catalog (`FalFieldSchema`) declares `required` and a `type`, but **no explicit modality grouping and no exclusivity groups** — the one known XOR (kling `prompt`/`multi_prompt`) is hardcoded in API runtime, per the catalog's own JSDoc. Both the canvas and the API need this metadata (sad §4 pillar 4; spec §8 OQ).

## Decision drivers

- AC-02 / AC-06: the canvas and the API must apply the same compatibility + exclusivity rules.
- DRY single source: the rule must not live in two places (UI render vs API validate).
- The catalog is shared (`packages/api-contracts`), consumed by `api`, `web-editor`, and `media-worker`.

## Considered options

1. **Extend the catalog schema** — add `modality` + `exclusiveGroup` fields to the field schema; both surfaces read the data.
2. **Keep it runtime-coded** — per-model XOR/modality logic in an API validator; the canvas asks the API for compatibility.

## Decision outcome

**Chosen:** Option 1. Data-driven metadata lets the canvas render typed handles and reject connections without a server round-trip (AC-02 ≤ 100 ms feedback, spec §6) while the API reads the same declaration at Generate time — one source, no duplicated rule. The exact schema fields are materialized in `sdd:data-model` (which validates whether any catalog entry already encodes exclusivity). Runtime-coding would split the rule across UI and API and force a round-trip for connect-time feedback.

## Consequences

**Positive**
- One declaration drives both connect-time UX and Generate-time validation.
- Removes the hardcoded kling XOR special-case from API runtime.

**Negative**
- A schema change to a shared package consumed by three modules; every model entry must declare the new fields (backfill).

**Neutral**
- The precise field names/shape are settled in `sdd:data-model`; this ADR fixes only that the metadata lives in the catalog.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
