---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-03"
feature_size: "L"
ticket: "generate-ai-flow"
---

# 0007 — Link flow results to the library via a flow_files pivot and jobs.flow_id

- **Status:** Accepted
- **Date:** 2026-06-03
- **Deciders:** Architect + Tech Lead (Socratic walk)

## Context

Every successful Generate must add its result to the Creator's general library linked to the flow (spec AC-01), and deleting a flow must drop the linkage while preserving the library asset (spec AC-19). The `files` library is user-owned with no project column; project/draft linkage is done via pivot tables (`project_files`, `draft_files`), and the worker auto-links a result through `ai_generation_jobs.draft_id` on completion (sad §4 pillar 2).

## Decision drivers

- AC-01: a successful result is linked to the flow that produced it.
- AC-19: deleting a flow never deletes library assets — only the linkage.
- Convention fit: `draft_files` + `ai_generation_jobs.draft_id` is the established auto-link pattern.

## Considered options

1. **`flow_files` pivot + nullable `ai_generation_jobs.flow_id`** — mirror `draft_files`: `ON DELETE CASCADE` on the flow, `RESTRICT` on the file; the worker `INSERT IGNORE`s into the pivot on completion.
2. **A `flow_id` column directly on `files`** — denormalize the link onto the asset row.

## Decision outcome

**Chosen:** Option 1. The pivot is the codebase's existing idiom and gives AC-19 for free: cascading the pivot on flow delete drops links, `RESTRICT` on the file keeps the asset. A direct `files.flow_id` would couple a user-owned asset to one flow and break the "asset outlives the flow" invariant. The worker's existing `setOutputFile` is extended to honor `flow_id` exactly as it honors `draft_id`.

## Consequences

**Positive**
- AC-19 falls out of the FK cascade rules; no application-level cleanup.
- Reuses the `draft_files` auto-link path almost verbatim.

**Negative**
- One more pivot table + a nullable column on the shared `ai_generation_jobs` table.

**Neutral**
- A result asset can be referenced by both a flow and (later) a project without conflict — pivots are independent.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: [[0001-reuse-ai-generate-job-pipeline-for-flow-generation]], [[0002-persist-flow-canvas-as-a-single-json-document-column]]
