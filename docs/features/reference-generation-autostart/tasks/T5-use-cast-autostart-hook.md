---
id: T5
title: "New useCastAutostart(draftId) hook + widen client return type"
layer: ui
deps: []
acs: ["AC-01", "AC-05"]
files_hint:
  - "apps/web-editor/src/features/storyboard/hooks/useCastAutostart.ts"
  - "apps/web-editor/src/features/storyboard/hooks/useCastAutostart.test.ts"
  - "apps/web-editor/src/features/storyboard/api.ts"
owner: "Oleksii (Storyboard squad)"
estimate: "M"
status: "todo"
---

# T5 — `useCastAutostart(draftId)` hook

## Why

Today extraction lives in `StoryboardPage` local state and is polled only while the modal is open — there is **no entry-time existence check**, so nothing auto-starts on Step-2 entry ([sad §4 choice 2](../sad.md); US-01, AC-01). A dedicated hook encapsulates the mount existence-check, the conditional start, the in-flight guard, and the poll, exposing one query both the auto-path and the manual control read.

## What

New `hooks/useCastAutostart.ts`:
- On mount for a `draftId`, resolve the latest extraction via the single TanStack Query entry `['cast-extraction', draftId]` (existence check — must resolve inside the 500 ms page-ready budget, so one cached query, no waterfall).
- If **none exists**, issue the silent start (`startCastExtraction`) — no modal forced open, no charge (AC-01). If one exists (`queued`/`running`/`completed`), start **nothing** (AC-05).
- **In-flight guard**: a per-draft client guard (ref/promise) suppresses the redundant start during a re-mount / StrictMode double-effect (latency/traffic optimization — the server idempotency from T1 is the correctness mechanism).
- Poll the query while the job is non-terminal (`queued`/`running`) on the existing 3 s interval; stop on `completed`/`failed`.
- Widen the `startCastExtraction` client return type in `api.ts` from `{ status: 'queued' }` to `{ status: 'queued' | 'running' | 'completed' }` (mirrors the T1 union / `contracts/openapi.yaml`).

## Definition of Done

- [ ] Hook test: mount with no existing extraction issues exactly **one** `startCastExtraction`; mount with an existing job issues **none** (AC-01 / AC-05).
- [ ] Hook test: a re-mount / double-effect does not issue a second start (in-flight guard).
- [ ] Hook test: polling stops once the job reaches `completed`/`failed`.
- [ ] `startCastExtraction` return type widened to the union; no new type errors in changed files.
- [ ] vitest (from `apps/web-editor`) for the hook passes.

## Notes

- Touches `api.ts` + new `hooks/` file — no overlap with the modal lane (T3/T4) or the page (T6) → parallelizes with T3/T4.
- The hook must **not** force the modal open (spec §1¶4, OQ-2 default = stay closed); opening is the Creator's action, wired in T6.
