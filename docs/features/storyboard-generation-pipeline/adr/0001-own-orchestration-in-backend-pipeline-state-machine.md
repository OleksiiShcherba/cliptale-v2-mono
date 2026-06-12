---
status: Accepted
owner: "Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-12"
feature_size: "L"
ticket: "storyboard-generation-pipeline"
---

# 0001 — Own Step-2 orchestration in a backend pipeline state machine

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Tech Lead, Architect (Socratic walk)

## Context

The Step-2 ("Video Road Map") generation flow is broken in production because its orchestration lives in the frontend (`useStoryboardPlanGeneration` / `useStoryboardIllustrations` hooks, the `StoryboardAutomationPhase` client enum): closing or reloading the tab loses all progress, and the cast/reference glue across four independently-shipped features has needed continuous patching (13 post-ship fixes in one day). The seam that fails is the orchestration ownership itself. The rework spans the api, the media-worker, and the web-editor.

## Decision drivers

- QG-1 *Resumability* — pipeline state must survive page close/reload/browser switch (spec §2, AC-05).
- The production failure root-cause is client-owned generation state.
- Existing platform conventions: api owns authoritative state in MySQL; the worker executes async jobs; the web-editor renders.
- Single-developer maintenance cost of per-feature glue patches.

## Considered options

1. **Backend-owned state machine** — the api holds the authoritative pipeline state; worker executes phases; web-editor projects. `target_surfaces = [backend-service, worker, web-frontend]`.
2. **Keep frontend orchestration + add server persistence** — periodically snapshot the client orchestration state to the backend for resume.
3. **Backend-only** — move state server-side but keep ad-hoc per-feature endpoints, no unified state machine.

## Decision outcome

**Chosen:** Option 1. The frontend becomes a pure projection of a single server-authoritative pipeline; every transition, cancel, skip and re-trigger is decided and persisted server-side. Option 2 keeps the broken authority on the client (snapshots race with live edits and still lose work between snapshots). Option 3 reproduces the un-unified glue that is the thing failing. This decision declares the feature's `target_surfaces` and is the umbrella for ADR-0002..0008.

## Consequences

**Positive**
- Resume is reconstructed from the backend, not client memory — directly satisfies QG-1.
- One place owns the state-machine invariants (phase order, single-active-run, stuck-release).
- Retires the *Scene planning* / *Illustration status* statuses and the `useStoryboard*Generation` orchestration hooks.

**Negative**
- A larger change surface (three surfaces) than a frontend patch.
- Requires a deploy-time migration of in-flight drafts (→ §11 OQ, ADR-0002 context).

**Neutral**
- The web-editor keeps its existing SPA architecture (custom external store + TanStack Query + `@xyflow/react`); only the orchestration-state ownership moves.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-single-pipeline-state-row-per-draft]], [[0003-advance-phases-via-worker-completion-hooks]]
