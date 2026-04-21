# Playwright Reviewer Memory Index

- [Environment & ports](environment.md) — Docker Compose ports and app URLs for ClipTale
- [Known Working Workflows](workflows.md) — 22 confirmed user journeys in ClipTale (Workflows 1-25); latest: HomePage scroll + Create Storyboard draft (subtask 1, 2026-04-18)
- [Selectors and Flaky Patterns](selectors.md) — Working selectors, broken selectors, and the Upload dropzone side-effect warning
- [Hook-only testing pattern](hook_testing_pattern.md) — When unit tests suffice instead of E2E for hook-only changes (backward compatible, no UI/routes)
- [Style-only testing pattern](style_testing_pattern.md) — When unit tests suffice for CSS/token-only changes (no logic or structure changes, full test regression pass)
- [Database migration testing pattern](db_migration_testing_pattern.md) — DB-only migrations verified by integration tests, not E2E (no UI to test)
- [A3 UI State verification](a3-ui-state-verification.md) — Hook-only UI state persistence verified via 15 unit tests split into 4 dot-infix files + code review, deployed at 15-236-162-140.nip.io (verified 2026-04-21)
- [B5 Undo Toast + Trash verdict](b5-undo-toast-verdict.md) — YES: 34 tests verify implementation; E2E blocked by environment (no npm in shell)
- [D2 Wizard Asset Detail verdict](d2-wizard-asset-detail-verdict.md) — YES: 8 component tests verify all flows (gallery→panel, add-to-prompt, delete+undo, close); E2E blocked by environment
- [E2 Scope Toggle verdict](e2-scope-toggle-verdict.md) — YES: 26 component tests verify toggle UI (useScopeToggle 8, AssetBrowserPanel.scope 9, MediaGalleryPanel.scope 9); E2E unavailable
- [E3 Auto-link verdict](e3-auto-link-verdict.md) — YES: 8 component tests verify both insertion paths (drop + prompt-chip); no new UI
- [F1 AI Panel Width Fluid verdict](f1_ai_panel_verdict.md) — YES: 9 unit tests verify compact modes (6 + 3 tests); style-only change deployed live
- [Subtask 3 Playwright Verdict](subtask3-verdict.md) — YES: Cache-first asset resolution verified via 58 FE unit tests + code review (E2E unavailable in shell)
