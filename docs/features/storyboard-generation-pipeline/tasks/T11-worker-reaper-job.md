---
id: T11
title: "Reaper repeatable job: release stuck phases"
layer: "infra"
deps: ["T3"]
acs: ["AC-12"]
files_hint:
  - "apps/media-worker/src/jobs/storyboardPipelineReaper.job.ts"
owner: "Backend"
estimate: "S"
status: "todo"
---

# T11 — Reaper repeatable job

## Why

Lazy-on-read (T4) releases a stuck phase only when a client is watching; a **closed** tab produces no read, so a backstop sweep must release it (AC-12). Derives from [ADR-0005](../adr/0005-release-stuck-phases-via-lazy-read-and-reaper.md), [events.md §Reaper job](../contracts/events.md), [Flow 2 (sad §6)](../sad.md).

## What

`storyboardPipelineReaper.job.ts` — a **BullMQ repeatable** job that:
- runs `findStuck` (T3) for over-bound running phases (`heartbeat_at < NOW(3) - INTERVAL <bound> MINUTE`, bound from `APP_*`, default 10 min);
- for each, applies the `failed` transition, sets `error_message`, clears the active-run marker, bumps `version` and publishes `storyboard.status.updated` (T14).

## Definition of Done

- [ ] Integration test seeds a stuck row (`insertStuckPhase`) and asserts the reaper marks it `failed`, sets `error_message` and clears the run.
- [ ] The sweep uses `idx_storyboard_pipeline_active_heartbeat` (no full scan).
- [ ] Registration in the worker bootstrap is done in T14.
- [ ] lint + vet clean.

## Notes

- Reuses the same transition path as lazy-on-read (T4) — one release code path, two triggers.
- Bound configurable, not hard-coded (§11 false-positive risk; heartbeat tracks real per-unit progress).
