---
name: Ruling: components importing directly from feature api.ts
description: Components calling api.ts functions directly is an established project pattern; do not flag as violation unless a component bypasses api.ts and calls fetch directly
type: project
---

Components in `apps/web-editor/src/features/*/components/` import and call functions from their feature's `api.ts` directly (e.g. `TranscribeButton.tsx` calls `triggerTranscription`, `TimelinePanel.tsx` calls `createClip`). This predates the subtasks under review and is consistent across multiple features.

**Why:** The architecture rules say API calls must go through `lib/api-client.ts`, not that they must be mediated by a hook. Direct calls from components to feature `api.ts` (which correctly wraps `apiClient`) are an accepted pattern.

**How to apply:** Do NOT flag a component importing from `features/[name]/api.ts` as a violation. Only flag if the component calls `fetch` directly or bypasses `api-client.ts`.
