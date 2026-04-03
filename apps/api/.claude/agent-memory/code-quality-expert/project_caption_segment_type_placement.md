---
name: CaptionSegment type placement ruling
description: CaptionSegment moved to packages/project-schema — issue resolved in re-review 2026-04-03
type: project
---

`CaptionSegment` was originally defined in `apps/api/src/repositories/caption.repository.ts` (flagged as warning in Subtask 3). It has since been moved to `packages/project-schema/src/types/job-payloads.ts` and re-exported from `packages/project-schema/src/index.ts`. The repository now imports it from `@ai-video-editor/project-schema` and re-exports it for downstream consumers. The service imports directly from `@ai-video-editor/project-schema`.

**Why:** Per §4 Dependency Rules, repositories contain only SQL and mapping; domain types used across layers belong in `packages/project-schema/`.

**How to apply:** This issue is closed. If `CaptionSegment` is moved back or a new cross-layer domain type appears in a repository, flag it again. The re-export from the repository is an acceptable compatibility shim as long as the type originates in `project-schema`.
