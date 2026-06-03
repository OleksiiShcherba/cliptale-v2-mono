---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-03"
feature_size: "L"
ticket: "generate-ai-flow"
---

# 0002 — Persist the flow canvas as a single JSON document column

- **Status:** Accepted
- **Date:** 2026-06-03
- **Deciders:** Architect + Tech Lead (Socratic walk)

## Context

A flow's canvas is a node graph: content/generation/result blocks, typed edges, node positions, and per-block parameters. It is read whole when a flow opens (spec AC-10) and saved whole on autosave. We must choose how that graph is stored (sad §4 pillar 2).

## Decision drivers

- Open-flow latency p95 ≤ 1500 ms (spec §6): a single-row read beats reassembling N block/edge rows.
- Convention fit: the storyboard editor already autosaves `{ blocks, edges, musicBlocks }` as a whole-document `PUT`.
- The canvas shape is client-owned and evolves with the UI; relational columns would couple migrations to UI iteration.

## Considered options

1. **One JSON document column** on `generation_flows` holding the whole canvas.
2. **Relational rows** — separate `flow_blocks` / `flow_edges` tables with FKs.
3. **Hybrid** — JSON canvas blob + relational rows only for result-block↔job↔file links.

## Decision outcome

**Chosen:** Option 1 for the canvas, with the result→library links kept relationally per [[0007-link-flow-results-to-library-via-flow-files-pivot]] (so option 3's spirit is honored only where FK integrity is actually needed). The canvas document is opaque to SQL; it loads and saves in one round-trip and mirrors the storyboard pattern. Links that must survive independently of the canvas (assets, jobs) live in real tables, not inside the blob.

## Consequences

**Positive**
- Cheap whole-canvas reload/save; matches the storyboard autosave idiom.
- UI can evolve the node shape without a migration.

**Negative**
- No SQL-level queries over blocks (e.g. "all flows using model X") — acceptable, not a requirement.
- Server-side Generate validation must parse the blob to resolve a block's inputs.

**Neutral**
- The blob is validated by a Zod schema in `packages/project-schema` (the canonical-shape convention), not by the DB.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: [[0003-detect-concurrent-flow-saves-with-an-optimistic-version-column]], [[0007-link-flow-results-to-library-via-flow-files-pivot]]
