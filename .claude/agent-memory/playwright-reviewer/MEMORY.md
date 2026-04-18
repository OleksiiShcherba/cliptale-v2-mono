# Playwright Reviewer Memory Index

- [Environment & ports](environment.md) — Docker Compose ports and app URLs for ClipTale
- [Known Working Workflows](workflows.md) — 22 confirmed user journeys in ClipTale (Workflows 1-25); latest: HomePage scroll + Create Storyboard draft (subtask 1, 2026-04-18)
- [Selectors and Flaky Patterns](selectors.md) — Working selectors, broken selectors, and the Upload dropzone side-effect warning
- [Hook-only testing pattern](hook_testing_pattern.md) — When unit tests suffice instead of E2E for hook-only changes (backward compatible, no UI/routes)
- [Style-only testing pattern](style_testing_pattern.md) — When unit tests suffice for CSS/token-only changes (no logic or structure changes, full test regression pass)
- [Database migration testing pattern](db_migration_testing_pattern.md) — DB-only migrations verified by integration tests, not E2E (no UI to test)
