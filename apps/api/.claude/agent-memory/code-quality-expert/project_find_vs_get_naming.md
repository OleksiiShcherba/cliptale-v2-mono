---
name: find* vs get* in repositories — Section 9 violation
description: Repository functions must use get prefix (not find), per existing peer conventions and Section 9 verb-first getter rule
type: project
---

The Section 9 getter naming convention (`getProjectById`, `getLatestVersionId`) applies to repository functions. Existing peer repositories (`asset.repository.ts`, `clip.repository.ts`) all use `getAsset*`, `getClip*` patterns. Functions named `findById`, `findByEmail`, `findByGoogleId`, `findByGithubId`, `findByTokenHash` in `user.repository.ts` and `session.repository.ts` were flagged as violations in the Epic 8 subtask 2 review (2026-04-07).

**Why:** Section 9 explicitly lists getter examples with `get` prefix. The codebase pattern confirms this. `find*` is not in the approved getter vocabulary.

**How to apply:** Flag any new `find*` function in a repository file as a Section 9 naming violation.
