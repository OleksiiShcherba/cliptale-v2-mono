# QA Engineer Memory Index

- [Test infrastructure — vitest binary location and per-package run commands](test-infra.md) — root node_modules/.bin/vitest only; sub-package .bin dirs are empty; known non-blocking warnings
- [Pre-existing test failures in API integration suite](pre-existing-failures.md) — 2 tests in assets-endpoints + assets-finalize-endpoint fail due to wrong response key (assetId vs id); pre-date all epics
- [EPIC 9 Ticket 6 — Asset resolver for fal.ai image inputs](epic9-ticket6-asset-resolver.md) — 48 tests; happy path, edges, errors, ownership all covered; zero regressions
- [Subtask B5 — PATCH /assets/:id endpoint](subtask-b5-patch-endpoint.md) — 9 integration tests; full validation, ownership, persistence coverage; all passing
