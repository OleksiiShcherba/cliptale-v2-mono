---
name: Monorepo package imports misplaced in test files
description: In test files, @ai-video-editor/* package imports (group 3) are written after @/ absolute imports (group 4) — a recurring §9 import-ordering violation
type: project
---

In `useClipDeleteShortcut.test.ts` (flagged 2026-04-05), `import type { Clip, Track, ProjectDoc } from '@ai-video-editor/project-schema'` appeared at line 23, after the group-4 `@/store/*` imports at lines 21–22. The correct order is: external packages (group 2) → monorepo packages (group 3) → app-internal absolute imports (group 4) → relative imports (group 5).

**Why:** Developers tend to add monorepo type imports as an afterthought alongside app-internal imports, conflating `@ai-video-editor/*` (workspace packages, group 3) with `@/` aliases (app-internal, group 4).

**How to apply:** In every test file review, check that any `@ai-video-editor/*` import appears in its own group 3 block, separated by a blank line from both the group-2 external-package block above and the group-4 `@/` block below.
