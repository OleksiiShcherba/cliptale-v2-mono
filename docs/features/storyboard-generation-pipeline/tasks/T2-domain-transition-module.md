---
id: T2
title: "Build the shared pipeline transition module (pure)"
layer: "domain"
deps: []
acs: ["AC-07", "AC-08", "AC-14", "AC-15"]
files_hint:
  - "packages/project-schema/src/storyboardPipeline/transition.ts"
owner: "Backend"
estimate: "M"
status: "todo"
---

# T2 — Build the shared pipeline transition module (pure)

## Why

Transitions and guards must live in **one** place invoked by both api (Creator actions) and worker (completion-hooks), so the state-machine invariants hold regardless of which surface drives them. Derives from [ADR-0003](../adr/0003-advance-phases-via-worker-completion-hooks.md), [ADR-0007](../adr/0007-single-active-run-via-active-run-marker-and-cas.md), [sad §5/§8](../sad.md).

## What

A **pure** module (no DB, no I/O) in `packages/project-schema` — the only package the worker imports — exporting:
- the phase order `scene → reference_data → reference_image → scene_image` and the sub-state lifecycle (`idle/running/awaiting_review/completed/cancelled/failed/skipped`);
- the transition table (which `(phase, sub-state, event)` → next state);
- the **phase-order guard** (a later phase requires its prerequisite `completed`/`skipped` — AC-08) and the **scenes-required guard** (AC-15);
- the **single-active-run decision**: given the current `active_run_phase` + `version`, decide claim vs. return-existing (AC-14), and the `skipped`≠`idle` rule (AC-07).

Persistence (the actual CAS write) is T3; this module returns *decisions*, it does not touch MySQL.

## Definition of Done

- [ ] Unit tests cover every legal transition and every illegal one (out-of-order, double-claim, skip-from-non-awaiting), with no DB.
- [ ] Phase-order + scenes-required guards return a typed rejection the controller maps to `pipeline.phase_out_of_order` / `pipeline.scenes_required`.
- [ ] Single-active-run decision returns "claim" only when `active_run_phase IS NULL`, else "return existing".
- [ ] lint + vet clean.

## Notes

- Parallel root task with T1 — no deps.
- Keep it framework-free so both `apps/api` and `apps/media-worker` import it (worker already imports `@ai-video-editor/project-schema`).
- Mirrors existing idioms: `storyboard_reference_blocks.version` CAS, `storyboard_music_generation_jobs.active_lock`.
