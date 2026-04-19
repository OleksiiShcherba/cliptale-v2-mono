---
name: Timeline-drop regression fix verification anchors
description: Post-fix invariants for the Remotion black-screen + POST /clips 400 bug fix (2026-04-19)
type: project
---

Two Files-as-Root consumer sites had to be caught after the wire rename:

1. **Remotion VideoComposition consumed `clip.assetId`** (video/audio/image branches) long after the clip schema itself moved to `fileId`. Grep-verify `clip\.assetId` across the repo — should hit only log/memo text, zero code.
2. **`useProjectInit` never pushed the URL-resolved projectId into `project-store.snapshot.id`.** Both success and 404 branches must now call `setProjectSilent({ ...(docJson|getSnapshot()), id: projectId })`. The store still holds the `DEV_PROJECT` fixture at `00000000-…-000001` as its initial seed; if the hook doesn't override on hydrate, downstream POSTs target the fixture UUID → 400 from `isFileLinkedToProject`.

**Why:** Large rename waves (`assetId` → `fileId`) hit the explicit grep-list, but **consumer-side property reads on union shapes** can escape because TypeScript may widen to `any` across package boundaries and inline fixtures keep the old property name. The second bug was subtler: the store's seed id had always been stale, but earlier flows tolerated it (all non-URL writes used the DEV fixture as the "project"). Once Files-as-Root enforced per-project file linking via `isFileLinkedToProject`, the stale snapshot id became fatal.

**How to apply:** On any future wire/property rename (or on any change to `project-store.snapshot.id` initialization), run these grep anchors:

- `clip\.assetId` across all `apps/*` + `packages/*` — must be 0 hits.
- `setProjectSilent` in `useProjectInit.ts` — must see `id: projectId` in both success and 404 branches.
- `DEV_PROJECT` in `project-store.ts` — still a dev fixture; candidate for removal (noted in dev-log TODOs). As long as it remains, both `useProjectInit` branches must spread-override its id.

**E2E regression spec:** `e2e/timeline-drop-regression.spec.ts` — asserts POST `/projects/<real-uuid>/clips` returns 201 and URL does NOT contain `00000000-0000-0000-0000-000000000001`. Uses `storageState` reuse via `beforeAll` to dodge the `express-rate-limit` 5-req/15-min login limiter; needs seeded `e2e2@cliptale.test`.
