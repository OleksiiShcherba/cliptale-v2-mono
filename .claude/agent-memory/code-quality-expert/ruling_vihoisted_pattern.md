---
name: Recurring violation: vi.mock without vi.hoisted
description: Senior dev repeatedly declares const mock variables before vi.mock() factories without using vi.hoisted() — a flagged rule violation per arch rules §10
type: project
---

In `useVersionHistory.test.ts` and `useAutosave.test.ts` (both 2026-04-04 reviews), the developer declares `const mockFn = vi.fn()` at module level and then references those variables inside `vi.mock()` factory closures without wrapping the declarations in `vi.hoisted()`. The pattern appears even when each mock is wrapped in a lambda (e.g. `getSnapshot: () => mockGetSnapshot()`) — the factory still holds a reference to the outer `const` which is in the temporal dead zone when the hoisted factory executes.

Architecture rules §10 ("vi.mock hoisting pitfall") explicitly require `vi.hoisted()` for any variable that is both:
1. Declared outside the `vi.mock()` factory, and
2. Referenced inside the `vi.mock()` factory

**Why:** This is a recurring pattern (appeared multiple times in prior test files too). Always flag it as a ❌ violation when reviewing new test files.

**How to apply:** When reviewing any test file, check if `vi.mock()` factory closures reference variables declared with `const`/`let` in the module body. If they do and no `vi.hoisted()` wrapper is used, flag as a violation citing §10. The violation also applies to mutable `let` counters (e.g. `let uuidCounter = 0`) referenced inside a `vi.mock` factory closure — seen in `useAddAssetToTimeline.test.ts` line 22–25 (2026-04-05 review).
