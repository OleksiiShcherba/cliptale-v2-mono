# QA Engineer Memory Index

- [Test Infrastructure](test-infra.md) — Vitest per-package, no root test command, jsdom vs node environments, forwardRef mock pattern for Remotion Player, inline object literal in renderHook causes infinite loop, deferred promise pattern for floating async hooks
- [Deferred E2E](deferred-e2e.md) — No E2E framework exists yet; priority flows to add when Playwright is wired
- [Workspace and Test Discovery](workspace_discovery.md) — Only registered turbo workspaces run tests; unregistered dirs like infra/ orphan test files
- [A2 Integration Test Pattern](a2-integration-test-pattern.md) — Real MySQL (never mock), mock only external services, auth bypass disabled, it.todo() for deferred scenarios with rationale
- [C2 Thumbnail QA Review](qa-review-c2-thumbnail.md) — Thumbnail generation unit tests verified; 14 tests total (ingest.job + file.repository); all mocks at correct boundaries; regression clear
- [D2 Wizard Asset Panel QA Review](qa-review-d2-wizard-asset.md) — 7 component integration tests; panel open/Add to Prompt/Delete/Undo covered; rename has known query-key limitation in wizard context (deferred follow-up)
- [E2 Scope Toggle QA Review](qa-review-e2-scope-toggle.md) — 26 tests (8 hook + 9 browser + 9 gallery); all acceptance criteria verified; vi.mock hoisting fixed
- [F2 Storyboard Service QA Review](qa-review-f2-storyboard.md) — 12 unit + 10 integration tests; ownership/idempotency/history-cap/transaction coverage complete; A2 pattern compliant
