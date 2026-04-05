---
name: Test Infrastructure
description: Test runner setup, environment, and per-package conventions across the monorepo
type: project
---

## Test framework: Vitest everywhere

All packages and apps use Vitest (not Jest). Run tests per-package with `npm test` from the package directory. There is no root-level test command that runs all suites.

- `apps/api` — Vitest, Node environment, `vitest.config.ts` with `@` alias → `src/`. Setup file at `vitest.setup.ts` injects stub env vars so `config.ts` does not call `process.exit(1)` during test collection.
- `apps/web-editor` — Vitest, jsdom environment (no vitest.config.ts; vite.config.ts drives it). `@testing-library/react` + `@testing-library/user-event`.
- `packages/remotion-comps` — Vitest, jsdom, explicit `vitest.config.ts` required because it is a standalone package (not under Vite).

**Why:** Vitest was chosen for native TypeScript+ESM support without transpile overhead.

## No E2E framework

No Playwright or Cypress config exists in the repo as of 2026-04-02. E2E tests cannot be written or run until a framework is wired. Do not block QA stamps on E2E for now.

## dev auth bypass affects integration tests

`auth.middleware.ts` and `acl.middleware.ts` both short-circuit when `NODE_ENV === 'development'`. Tests that set `NODE_ENV = 'development'` in a `beforeEach` must restore it to `'test'` in `afterEach`, otherwise subsequent test files in the same worker process see the wrong environment. Both middleware test files already do this correctly — enforce the pattern if new tests are added.

**Impact:** Any integration test for an authenticated endpoint must ensure `NODE_ENV` is not `'development'` during the test run, or the middleware bypasses auth and the test will not exercise the real path.

## App.test.tsx is a live file — extend it for every new App.tsx feature

`apps/web-editor/src/App.test.tsx` already exists and covers the shell layout, sidebar, and preview section. When a new component is conditionally rendered inside `App.tsx` (e.g. `RightSidebar`), the new conditional logic must be tested by adding a describe block to `App.test.tsx` — not by creating a separate test file. Mock both `useEphemeralStore` and `useProjectStore` at the module level in that file; they are already wired in.

**Why:** Discovered during Subtask 7 review — the `RightSidebar` conditional logic (all 4 guard branches + happy path + clip prop forwarding) was unimplemented in `App.test.tsx` despite the test file existing.

**Impact:** Every future feature that touches `App.tsx` must update `App.test.tsx`. Check for this file before creating a new test file for any root-level App logic.

## ClipLane.test.tsx — always supply projectId in defaultProps

`ClipLane` now requires a `projectId` prop (added in the bug-fix session for the `createClip` API call after split). Any test that renders `<ClipLane>` without `projectId` will pass TypeScript (prop is typed as required) but silently call `createClip('undefined', clip)`. Always include `projectId: 'project-001'` in the `defaultProps` object and mock `../api` at the top of the test file.

**Why:** Discovered during the 2026-04-04 bug-fix QA review — the original test file was written before `projectId` was added to `ClipLaneProps`.

**Impact:** Every future test that renders `ClipLane` must supply `projectId`. The `../api` module must be mocked (`vi.mock('../api', () => ({ createClip: vi.fn(), patchClip: vi.fn() }))`) so split tests do not make real network calls.

## useAutosave saveVersion payload field names changed

The `saveVersion` API call in `useAutosave.ts` changed from `{ doc_json, patches, inversePatches, parentVersionId }` to `{ docJson, docSchemaVersion, patches, inversePatches, parentVersionId }` (bug-fix session 2026-04-04, item #3). The timing test in `useAutosave.timing.test.ts` was updated accordingly. Use camelCase field names in all future saveVersion assertions.

**Why:** The API contract change caused a regression in `useAutosave.timing.test.ts` that was discovered and fixed during QA review.

**Impact:** Any test that asserts on `saveVersion` call arguments must use `docJson` (not `doc_json`) and include `docSchemaVersion`.

## useRemotionPlayer mock in App.test.tsx must use vi.fn()

The `vi.mock('@/features/preview/hooks/useRemotionPlayer')` factory in `App.test.tsx` must use `vi.fn(() => ...)` (not a plain arrow function) so that `vi.mocked(useRemotionPlayerModule.useRemotionPlayer).mockReturnValue(...)` works in individual tests. A plain function cannot have `.mockReturnValue` called on it and causes `TypeError: mockUseRemotionPlayer.mockReturnValue is not a function`.

**Why:** Discovered when writing Bug 3 (ruler click seek) tests — the original factory used a plain function, so `mockReturnValue` could not override the player instance per-test.

**Impact:** Any test that needs to inject a real mock player into `PreviewSection` must have `vi.fn()` in the factory. When adding new tests to `App.test.tsx`, the `useRemotionPlayer` mock must stay as `vi.fn(...)`, and a `beforeEach` in the `PreviewSection` describe block must restore the default return value.

## Remotion Player mock must use forwardRef

When testing `PreviewPanel` (or any component that passes a `ref` to Remotion `<Player>`), the `vi.mock('@remotion/player')` factory must use `React.forwardRef` to capture the ref. A plain functional mock component silently discards the ref, making `playerRef` forwarding behavior untestable.

**Why:** Discovered when adding tests for the optional `playerRef` prop in PreviewPanel. The original mock was a plain function; ref was invisible to assertions.

**Impact:** Always use `React.forwardRef` in the Player mock when ref forwarding is part of the contract being tested.
