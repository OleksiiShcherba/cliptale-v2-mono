---
name: Integration tests must use session tokens or APP_DEV_AUTH_BYPASS after Epic 8 subtask 5
description: After JWT→session migration, integration tests still send JWT Bearer tokens which the new auth.middleware.ts does not verify — all authenticated integration tests return 401 unless fixed
type: project
---

After subtask 5 of Epic 8, `auth.middleware.ts` was rewritten to do session-based auth (SHA-256 hash of Bearer token, lookup in `sessions` table). The integration tests under `apps/api/src/__tests__/integration/` still use `jsonwebtoken` to mint JWT tokens as Bearer tokens. The new middleware passes these to `authService.validateSession()`, which hashes them and looks them up in the `sessions` table — they are never found, so all authenticated endpoints return 401.

**Why:** The dev explicitly noted "203 API unit tests passing" but the integration tests require a running DB and the bypass is set to true in docker-compose.yml. Integration tests likely pass only because `APP_DEV_AUTH_BYPASS=true` is inherited from the `.env` file in the docker environment, not because the session auth path is tested.

**How to apply:** When reviewing any future subtask that touches or adds integration tests in `apps/api/src/__tests__/integration/`, check whether they either:
1. Set `APP_DEV_AUTH_BYPASS=true` explicitly in the test env setup, or
2. Seed a real session row in the `sessions` table and send the raw (pre-hash) token as the Bearer token.

Using `jwt.sign()` tokens as Bearer tokens is now incorrect for the production auth path.
