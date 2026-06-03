---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead"]
updated_at: "2026-06-03"
feature_size: "L"
ticket: "generate-ai-flow"
---

# 0003 — Detect concurrent flow saves with an optimistic version column

- **Status:** Accepted
- **Date:** 2026-06-03
- **Deciders:** Architect + Tech Lead (Socratic walk)

## Context

A Creator may have the same flow open in two tabs and edit both (spec AC-10b). The second tab's autosave must not silently overwrite the first tab's changes — the conflict must be detected and the second save rejected. The storyboard `PUT /storyboards/:id` is a blind overwrite and does not meet this bar (sad §4 pillar 2).

## Decision drivers

- AC-10b: silent loss is forbidden; the first save stays authoritative and the second is warned.
- Convention fit: `projects` already implements optimistic concurrency via `latest_version_id` → `OptimisticLockError` (409) in `version.service.ts`.
- Autosave round-trip ack ≤ 800 ms (spec §6): the check must be a single cheap compare, not a merge.

## Considered options

1. **Optimistic version column** — `generation_flows.version` (or a `latest_version` pointer); a save carries its parent version, a mismatch throws `OptimisticLockError` (409).
2. **`updated_at` timestamp guard** — If-Unmodified-Since style; reject if the stored `updated_at` moved.

## Decision outcome

**Chosen:** Option 1. It is the idiom already in the codebase (`OptimisticLockError extends ConflictError`, 409) so the web client's 409 handling and the API error mapping are reused verbatim. A monotonic integer version is race-safe; an `updated_at` guard is vulnerable to sub-millisecond collisions and has no precedent here. The client surfaces the 409 as the AC-10b "reload to continue" warning.

## Consequences

**Positive**
- Reuses the proven `projects` concurrency pattern + the existing 409 error class and central handler.
- Deterministic conflict detection independent of clock granularity.

**Negative**
- The client must thread the current version through every autosave and handle 409 by forcing a reload (no auto-merge in v1).

**Neutral**
- Deliberately diverges from the storyboard's blind-overwrite; the divergence is documented here so the two canvases aren't assumed identical.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-persist-flow-canvas-as-a-single-json-document-column]]
