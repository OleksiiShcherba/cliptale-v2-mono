---
id: T4
title: "Add flow-canvas Zod schema + extend the ai-generate job payload with flow linkage"
layer: "domain"
deps: []
acs: ["AC-10"]
files_hint: ["packages/project-schema/src"]
owner: "Backend Lead"
estimate: "M"
status: "todo"
---

# T4 — Flow-canvas Zod schema + job-payload extension

## Why

The canvas is persisted as one opaque JSON column (ADR-0002); its *shape* is validated by a Zod schema in `packages/project-schema`, not the DB. The same package extends the ai-generate job payload with the flow linkage so the reused pipeline can carry it. Derives from [sad §8 Canonical schema](../sad.md), [ADR-0001](../adr/0001-reuse-ai-generate-job-pipeline-for-flow-generation.md), [ADR-0002](../adr/0002-persist-flow-canvas-as-a-single-json-document-column.md), [data-model.md §generation_flows.canvas](../data-model.md).

## What

In `packages/project-schema`: a `FlowCanvas` Zod schema covering blocks (content/generation/result with `blockId`, type, position, per-block params/content), edges (typed connections), and viewport; export the inferred TS type. Extend the existing ai-generate job payload schema with optional `flowId` + `blockId`. Keep block/edge field names aligned with the OpenAPI `FlowCanvas` (open object) so the wire + persistence shapes agree.

## Definition of Done

- [ ] `FlowCanvas` schema parses a minimal valid canvas and a fully-populated one; round-trips (parse→serialize→parse) without loss
- [ ] ai-generate payload type carries optional `flowId`/`blockId` and existing consumers still type-check
- [ ] Unit tests for parse success + rejection of a malformed canvas pass
- [ ] lint + vet clean

## Notes

The DB stores `canvas` as opaque JSON — this schema is the only structural guard (the OpenAPI `FlowCanvas` is intentionally an open object). Shared by `api`, `web-editor`, `media-worker` — keep it dependency-light.
