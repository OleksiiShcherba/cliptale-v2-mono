---
status: Accepted
owner: "Oleksii (Storyboard squad)"
reviewers: ["Tech Lead"]
updated_at: "2026-06-09"
feature_size: "M"
ticket: "scene-generation-reference-gate"
---

# 0001 — Target the backend-service, web-frontend and worker surfaces

- **Status:** Accepted
- **Date:** 2026-06-09
- **Deciders:** Oleksii (Storyboard squad), Tech Lead

## Context

This feature replaces the storyboard scene-generation precondition (a star gate) with a
Reference-done gate, reduces reference selection from multiple candidates to one per linked
block, and retires the principal image. The change spans three existing deployment units — the
API service that enforces the gate and resolves selection, the media-worker that consumes the
selection and previously read the principal image, and the React SPA that hosts the
principal-image step being removed and must render the new gate rejection.

## Decision drivers

- US-07 / AC-08 require removing the principal-image approval step from the Creator's path — a frontend change.
- US-02 / AC-04b require the rejection to *name* blocking blocks and reference-less scenes — a frontend rendering concern over an API-shaped error.
- The single-selected-output reduction (ADR-0003) lives in the media-worker selection code.
- Constraint §2: zero infrastructure overrides — reuse the existing api / web-editor / media-worker containers.

## Considered options

1. **api + web-editor + media-worker** — gate/selection in api, multi→single + drop principal-read in worker, remove principal step + render rejection in SPA.
2. **api + media-worker only** — assume the existing UI already covers the principal modal and rejection without change.

## Decision outcome

**Chosen:** Option 1 (all three surfaces). US-07 mandates removing the principal-image approval
UI and US-02/AC-04b mandate rendering a richer rejection (named blocks + reference-less scenes),
both of which are frontend work; the worker must change to honour single-output selection and to
stop reading the principal image. Option 2 is excluded because the principal step cannot be
retired without touching the SPA.

## Consequences

**Positive**
- One coherent change across the surfaces that actually own each concern; no new deployment unit.
- Mirrors the predecessor `storyboard-reference-flows` surface split — familiar topology.

**Negative**
- A three-surface change must land its API contract, worker payload, and UI in sync (OpenAPI hand-maintained, §2 convention).

**Neutral**
- The gate stays authoritative server-side; any UI pre-disabling of the start control is inherited convenience, not re-specified here.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-gate-on-persisted-reference-output-existence]], [[0003-feed-each-linked-block-a-single-selected-reference-output]], [[0004-retire-principal-image-by-ignoring-it-on-read]]
