---
id: T10
title: "Implement per-Creator Redis sliding-window generation rate limit"
layer: "app"
deps: []
acs: []
files_hint: ["apps/api/src/lib/flow-rate-limit.ts"]
owner: "Backend Lead"
estimate: "S"
status: "todo"
---

# T10 — per-Creator Redis rate limit

## Why

The financial-abuse cap: a script bypassing the UI cost confirmation must still be stopped server-side. The UI confirmation alone is insufficient. Derives from [ADR-0004](../adr/0004-rate-limit-generate-with-a-per-creator-redis-sliding-window.md), [sad §4 / §8 Cost-safety gate](../sad.md), [spec §6 NFR (≤30/min) + §6.1 abuse cases](../spec.md). (NFR-driven — no single spec §5 AC owns the limit; AC-09 references that a retry counts against it.)

## What

`apps/api/src/lib/flow-rate-limit.ts`: a `checkAndConsume(userId)` helper enforcing ≤30 Generate runs/min/Creator via a Redis sliding window (`redis` singleton), returning `{ allowed, retryAfterSeconds }`. Independent of the IP-level `express-rate-limit` middleware — keyed on the authenticated `userId`, so scripting can't bypass it. Consumed by the Generate enqueue path (T12) before any enqueue.

## Definition of Done

- [ ] The window allows up to 30/min/Creator and denies the 31st with a positive `retryAfterSeconds`
- [ ] The counter is per-`userId`, not per-IP
- [ ] Integration test drives the window past the cap and asserts rejection, then recovery after the window
- [ ] lint + vet clean

## Notes

No deps — can start immediately (parallel branch). The default 30/min is the spec §8 OQ resolution (owner: Product/Business, due before `sdd:tasks`); make the threshold a single named constant so a policy change is one edit. The 429 controller mapping is T15.
