---
name: Ruling — Storybook partial args type assertions and bracket notation narrowing
description: Pattern for narrowing Storybook StoryObj.args (Partial<Props>) in tests; when as unknown is acceptable
type: project
---

When testing Storybook stories, `StoryObj.args` is typed as `Partial<Props>` by Storybook convention, making every field optional. In `VideoComposition.stories.test.ts`, the dev introduced:

1. A local `StoryArgs` type narrows the shape after reading `.args` (line 20–23)
2. An `argsOf()` helper casts via `as unknown as StoryArgs` (line 27–28)
3. Bracket notation `c['type']` instead of `c.type` to access discriminated union members (lines 53, 78, 88, etc.)

**Root cause:** The `Clip` discriminated union from `@ai-video-editor/project-schema` does not satisfy `Record<string, unknown>`, preventing TypeScript's normal type narrowing in `.find()` callbacks. Without `as unknown`, the parameter `c` is implicitly `any`.

**Ruling:** This trade-off is acceptable for test code working around Storybook's runtime constraints:
- The `as unknown` cast is justified because we're narrowing a Storybook-specific `Partial<Props>` at test runtime, not production code
- Per §14, "Use `unknown` and narrow" — this code does exactly that
- Bracket notation for discriminated union access is unconventional but necessary here to avoid implicit-any errors
- This pattern does **not** establish a precedent for production code — it is Storybook-test-specific

**How to apply:** When reviewing story test files that use similar patterns, do NOT flag bracket-notation narrowing in story arg assertions as a violation. The pattern is intentional and confined to test fixtures. Only flag it if the same pattern appears in production code (services, components, hooks), where it would violate standard discriminated union practices.

**Verified in:** Subtask 3 story test review (2026-04-19). Build and tests passed (tsc clean, 61/61 tests).
