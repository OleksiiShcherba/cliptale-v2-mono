---
name: deferred E2E coverage for media-worker
description: E2E tests for BullMQ job handlers are deferred — no E2E framework is wired into media-worker
type: project
---

No E2E framework is configured in `apps/media-worker`. Playwright is in the monorepo for `apps/web-editor` only.

BullMQ job handler E2E coverage (i.e. end-to-end job queue integration tests with real Redis/MySQL/S3) is deferred until a Docker Compose-based integration test harness is established for worker apps.

**Why:** The worker runs headlessly and has no HTTP interface, so Playwright does not apply. Integration tests against real infrastructure are tested through Docker Compose (per project dev workflow memory), but no test runner is currently wired to spin up that environment for workers automatically.

**Impact:** Do not block QA stamps for worker subtasks on missing E2E tests. Unit tests with mocked boundaries are the accepted standard for job handlers. Flag this only if a QA cycle explicitly targets integration coverage.
