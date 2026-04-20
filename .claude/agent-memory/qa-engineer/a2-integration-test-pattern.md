---
name: A2 UI State Integration Test Pattern
description: Reference pattern for API integration tests validating service+middleware+repository chains
type: project
---

**Subtask A2** established a canonical pattern for integration tests in `apps/api/src/__tests__/integration/userProjectUiState.integration.test.ts`:

## Architecture Validated

The test validates the three-layer API architecture:
- **Service layer** enforces business invariants (project existence → NotFoundError)
- **Middleware** enforces access control (authMiddleware validates token, aclMiddleware stub checks role)
- **Repository** executes DB mutations (upsert with server-generated timestamp)

## Test Structure

### Database Setup
- Create **real mysql2 connection** in `beforeAll` (never mock the DB)
- Seed test data with random UUIDs for users, sessions, projects
- Hash session tokens via `sha256` to match `auth.middleware.ts` expectations
- Clean up in FK-safe order in `afterAll` (child rows before parents)

### Environment Configuration
- Set `APP_DEV_AUTH_BYPASS: 'false'` to ensure auth paths are actually exercised
- Mock only external services (BullMQ, S3); database must be real
- Dynamic `import(... '/index.js')` after env setup so `config.ts` reads correct values

### Auth Testing Strategy
- `401 absent header` — base case: no Authorization header
- `401 invalid token` — corner case: token not in database
- `404 missing project` — business logic: service throws NotFoundError
- Happy path assertions (200/204) — includes response shape validation

### Deferred Scenarios with `it.todo()`
- Mark as `it.todo('description with reason')` when a feature depends on incomplete infrastructure
- **Example:** `403 foreign project` deferred because ACL ownership check is a TODO stub in `acl.middleware.ts`
- This is **acceptable** — do not use `it.skip()` or omit the test; document intent via `it.todo()`

### Round-Trip Assertions
- Dedicate a separate `describe()` block for PUT→GET scenarios
- Verify state content matches what was stored
- Verify server-generated timestamp (`updatedAt`) is a valid ISO 8601 string
- Verify overwrites work (second PUT replaces first)
- Verify isolation (User A's state independent from User B's on same or different projects)

## Why This Pattern Works

The integration test hits the **real database and real middleware**, so contract violations between layers are caught immediately. Mocking the DB would hide:
- Subtle bugs in JSON serialization (mysql2 parses JSON columns automatically)
- Timestamp generation mismatches (server-side `ON UPDATE CURRENT_TIMESTAMP(3)` may differ from app code)
- FK cascade issues (cleanup tests validate FK constraints)

---

**Reference:** A2 QA review 2026-04-20 — all acceptance criteria validated, 403 deferred acceptable, regression clear.
