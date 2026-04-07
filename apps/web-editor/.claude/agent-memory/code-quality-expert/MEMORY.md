# Code Quality Expert — Memory Index

- [api-client is a fetch wrapper, not generated client](project_api_client_pattern.md) — The codebase uses a hand-rolled fetch wrapper in lib/api-client.ts; the api-contracts generated client is not yet wired in; do not flag this as a violation
- [useAssetPolling uses manual setInterval, not React Query](project_asset_polling_pattern.md) — asset-manager polling predates the React Query adoption; useTranscriptionStatus correctly uses React Query; both patterns coexist
- [Frame math in useAddCaptionsToTimeline hook](project_frame_math_in_hooks.md) — segment→clip frame conversion lives in the hook intentionally; editor-core is an empty stub; do not flag as §5 violation
- [Formatter functions in component files are a §5 violation](project_formatter_logic_in_components.md) — formatFileSize/formatDuration/getTypeLabel in .tsx files violate §5; must live in shared/utils/ or feature-local utils.ts
- [Cross-directory relative imports in timeline feature](project_cross_directory_relative_imports.md) — ../hooks/ pattern is a §9 violation; flag on new files, treat as pre-existing on already-reviewed files
- [Monorepo package imports misplaced in test files](project_monorepo_import_in_tests.md) — @ai-video-editor/* imports (group 3) placed after @/ imports (group 4) in test files is a recurring §9 violation
- [Fixture file exported functions require JSDoc](project_fixture_jsdoc.md) — .fixtures.ts exported functions need per-function JSDoc per §9; file-level block comment alone is not sufficient
- [Vitest vi.mock + import ordering gray area](project_vitest_mock_import_order.md) — vi.mock hoisting forces @/ imports after relative imports; flag as §9 warning not violation, note Vitest constraint
- [Styles companion file naming is a §9 violation](project_styles_companion_naming.md) — PascalCase.styles.ts is not a valid §9 naming pattern; utility/constants extraction must use camelCase.ts
- [Stale vi.mock for @/lib/constants after DEV_PROJECT_ID removal](project_stale_constants_mock.md) — 6 test files have dead-code mocks after hooks no longer import constants; §9 violation flagged 2026-04-05
- [interface used instead of type for hook result and state shapes](project_interface_vs_type_in_hooks.md) — hook result/state shapes declared with `interface` are a §9 violation; only *Props shapes use `interface`
