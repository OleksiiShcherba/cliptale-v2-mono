---
name: test-infra
description: How to run tests across the monorepo packages — vitest binary location, per-package config, known warnings
type: project
---

The monorepo root installs the `vitest` binary at `/home/oleksii/Work/ClipTale/cliptale.com-v2/node_modules/.bin/vitest`. Individual package `node_modules/.bin/` directories are NOT populated (no symlinks there). Always invoke vitest from the **root** `node_modules/.bin/vitest`, but run it with `cd` to the target package directory first so vite.config.ts / vitest.config.ts in that package is picked up.

**Package test entry points:**
- `apps/web-editor` — `vite.config.ts` contains `test:` block (jsdom environment). Run: `cd apps/web-editor && <root>/node_modules/.bin/vitest run`. 131 tests, 11 files as of 2026-04-02 (confirmed passing).
- `apps/api` — has its own `vitest.setup.ts`. Unit-only run: `<root>/node_modules/.bin/vitest run src/middleware/ src/services/`. DB integration tests under `src/__tests__/integration/` require a live MySQL instance (ER_ACCESS_DENIED_ERROR in CI) — exclude them unless DB creds are available. 43 unit tests as of 2026-04-02.
- `packages/remotion-comps` — has `vitest.config.ts`. Run: `cd packages/remotion-comps && <root>/node_modules/.bin/vitest run`. 22 tests as of 2026-04-02.

**Known non-blocking warnings:**
- `startFrom` / `endAt` prop warnings from Remotion's `<Video>` component appear in remotion-comps test stderr — these are Remotion internals passing custom props to DOM, not test failures.
- `act()` wrap warnings appear in web-editor `useAssetUpload.test.ts` — pre-existing, all tests pass.

**Why:** Discovered during 2026-04-02 QA cycle. **Impact:** Always use root vitest binary with package-directory `cd`; never try to run `./node_modules/.bin/vitest` from within a sub-package.
