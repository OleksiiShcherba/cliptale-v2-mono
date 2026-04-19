# Agent Memory — Code Quality Expert

- [Subtask 4 assetId removal — architecture review](ruling_subtask4_assetid_removal.md) — Approved: all code compliant with rules. Known issue (ai-generate writing to dropped table) is out-of-scope and tracked in backlog.
- [Ruling — Storybook type assertions and bracket notation narrowing](ruling_storybook_type_assertions.md) — `as unknown as StoryArgs` + bracket notation for discriminated union narrowing is acceptable in story tests; do not flag as violation
- [Architecture gray area: data transforms in Remotion compositions](ruling_remotion_composition_transforms.md) — sort/filter inside VideoComposition is a warning, not a violation; rule is ambiguous
- [Known stub: ACL middleware](known_stub_acl_middleware.md) — do not flag ACL middleware as incomplete; intentionally deferred
- [Ruling: split test files and fixture extraction](ruling_split_test_files.md) — .seek.test.ts multi-part suffix is a warning not violation; duplicated fixtures across split files are a warning
- [Playwright getByRole('generic') fragility](ruling_playwright_generic_role.md) — flag role="generic" selectors as warnings; prefer getByLabel or aria-label locator
- [Recurring violation: vi.mock without vi.hoisted](ruling_vihoisted_pattern.md) — dev repeatedly uses const mocks before vi.mock() factories without vi.hoisted(); always flag as violation per arch rules §10
- [Recurring violation: type keyword used for Props shapes](ruling_props_interface_not_type.md) — dev uses `export type FooProps` instead of `export interface FooProps`; always flag as ❌ per §9
- [Ruling: styles object camelCase naming in component files](ruling_styles_object_naming.md) — `const styles` / `const style` in component files uses camelCase; treat as warning not violation; pattern established in ClipBlock.tsx and accepted in prior reviews
- [setProject derives durationFrames — existing tests may break](ruling_setproject_durationframes_derivation.md) — toEqual(doc) assertions against getSnapshot() will fail if doc.durationFrames != computeProjectDuration result
- [Ruling: components importing directly from feature api.ts](ruling_component_direct_api_import.md) — established pattern; do not flag unless component bypasses api.ts and calls fetch directly
- [Recurring violation: UPPER_SNAKE_CASE constants inside function bodies](ruling_uppercase_constant_placement.md) — dev places module-level-style constants inside component bodies; always flag as ❌ per §9
- [Integration tests still use JWT tokens after session-auth migration](ruling_integration_tests_session_auth.md) — integration tests send jwt.sign() tokens; new auth.middleware.ts does session lookup — all auth'd integration tests return 401 unless bypass or real sessions are used
- [Integration test self-healing schema repairs are acceptable](ruling_integration_test_self_healing.md) — beforeAll/afterAll DDL repairs in migrate.integration.test.ts, schema-final-state.integration.test.ts are guardrails, not mocks; idempotent INFORMATION_SCHEMA-guarded repairs; singleFork: true prevents race conditions
