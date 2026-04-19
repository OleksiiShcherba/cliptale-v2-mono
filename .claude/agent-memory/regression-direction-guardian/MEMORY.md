# Memory Index

- [Migration reliability is an ongoing hazard](project_migration_reliability.md) — INFORMATION_SCHEMA+PREPARE guards apply partially under docker-entrypoint-initdb.d; live DB drifts from repo
- [API integration test failure classes](project_test_failure_classes.md) — Three distinct clusters (DEV_AUTH_BYPASS, DB schema drift, stale refactor debt) must be triaged separately not conflated as "pre-existing"
- [Reliable test commands](reference_test_commands.md) — Exact Vitest invocations for apps/api, apps/web-editor, apps/media-worker and DB schema inspection
- [Batch-2 cleanup verification anchors](project_batch2_cleanup_verification.md) — Post-batch invariants (migration runner, 8-value ENUM, zero assetId on wire) future reviews can grep-verify directly
- [Stale test-debt hotspots after files-as-root rename](project_stale_test_debt_hotspots.md) — assets-patch and generation-drafts-cards still INSERT into dropped project_assets_current; Subtask 3 grep missed this class
- [Batch-3 verification anchors](project_batch3_verification_anchors.md) — Repo-migration compat-adapter invariants, Class-A/C roster, intentional contract narrowings (fps/thumbnailUri always null), 335L asset.repository.ts ≥300-cap
