---
name: Subtask 1 assetId→fileId editor-core cleanup — NO DESIGN CHANGES
description: Pure test-fixture migration in packages/editor-core; zero UI/design surface
type: reference
---

# assetId → fileId Migration Cleanup — Subtask 1 Review (2026-04-19)

## Scope
- `packages/editor-core/src/index.test.ts` — test fixtures only
- `packages/editor-core/tsconfig.json` — removed test excludes
- `packages/editor-core/package.json` — added @types/node ^20.0.0

## Findings
**No design review needed.** This subtask touches:
1. Test file factories (`makeVideoClip`, `makeAudioClip`, `makeImageClip`) — updated `assetId` → `fileId`
2. TypeScript configuration — removed `"**/*.test.ts"` exclude to re-enable test type-checking
3. Package dependencies — added `@types/node` to resolve `node:crypto` import

## Zero UI Impact
- No React components rendered or modified
- No styles, spacing, colors, or design tokens touched
- No design guide violations possible (no UI surface)
- `editor-core` is a utility library (`computeProjectDuration`) + test fixtures — no visual output

## Status
✅ **Approved** — marked `checked by design-reviewer - YES` on 2026-04-19
