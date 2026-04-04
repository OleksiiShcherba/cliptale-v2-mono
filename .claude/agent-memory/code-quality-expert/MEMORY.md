# Agent Memory — Code Quality Expert

- [Architecture gray area: data transforms in Remotion compositions](ruling_remotion_composition_transforms.md) — sort/filter inside VideoComposition is a warning, not a violation; rule is ambiguous
- [Known stub: ACL middleware](known_stub_acl_middleware.md) — do not flag ACL middleware as incomplete; intentionally deferred
- [Ruling: split test files and fixture extraction](ruling_split_test_files.md) — .seek.test.ts multi-part suffix is a warning not violation; duplicated fixtures across split files are a warning
- [Playwright getByRole('generic') fragility](ruling_playwright_generic_role.md) — flag role="generic" selectors as warnings; prefer getByLabel or aria-label locator
- [Recurring violation: vi.mock without vi.hoisted](ruling_vihoisted_pattern.md) — dev repeatedly uses const mocks before vi.mock() factories without vi.hoisted(); always flag as violation per arch rules §10
- [Recurring violation: type keyword used for Props shapes](ruling_props_interface_not_type.md) — dev uses `export type FooProps` instead of `export interface FooProps`; always flag as ❌ per §9
