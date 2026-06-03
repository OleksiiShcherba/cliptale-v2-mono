---
id: T2
title: "Stage migration 047 — create flow_files pivot (CASCADE on flow, RESTRICT on file)"
layer: "migration"
deps: ["T1"]
acs: ["AC-19"]
files_hint: ["docs/features/generate-ai-flow/migrations/02_create_flow_files.up.sql", "docs/features/generate-ai-flow/migrations/02_create_flow_files.down.sql"]
owner: "Backend Lead"
estimate: "S"
status: "todo"
---

# T2 — Stage migration 047: create flow_files pivot

## Why

The relational link between a flow and the result assets it produced, kept separate from the JSON canvas so deleting a flow drops the linkage but never the library asset. Derives from [data-model.md §flow_files](../data-model.md), [ADR-0007](../adr/0007-link-flow-results-to-library-via-flow-files-pivot.md), [spec §AC-19](../spec.md). Mirrors `draft_files`.

## What

Promote the staged `02_create_flow_files.up.sql` / `.down.sql` to live `047_flow_files.sql`. Composite PK `(flow_id, file_id)`; FK `flow_id`→`generation_flows` **ON DELETE CASCADE**, FK `file_id`→`files` **ON DELETE RESTRICT**; `created_at` DATETIME(3), `deleted_at` nullable (app-level soft-delete); `idx_flow_files_file (file_id)` for the RESTRICT/reverse lookup.

## Definition of Done

- [ ] Staged 02 up/down promote to live `047_*` and apply cleanly
- [ ] CASCADE on the flow FK and RESTRICT on the file FK are both present and verified (deleting a linked `files` row is refused; deleting the flow drops the link)
- [ ] `idx_flow_files_file` exists
- [ ] up→down→up clean; lint + vet clean

## Notes

Depends on T1 (FK target `generation_flows` must exist). Serialized in the migration lane.
