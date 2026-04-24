---
name: E2E test authentication strategy
description: How to authenticate in E2E tests — seed test user via SQL, then login via /auth/login endpoint
type: feedback
---

## Authentication for E2E Tests

**Do NOT use APP_DEV_AUTH_BYPASS.** The app runs with real authentication.

### Step 1 — Seed the test user (idempotent)

Run this before any test that requires auth:

```bash
docker compose exec db mysql -ucliptale -pcliptale cliptale < apps/web-editor/e2e/seed-test-user.sql
```

This creates (or skips if exists) a user with:
- **Email:** `e2e@cliptale.test`
- **Password:** `TestPassword123!`
- **User ID:** `e2e-test-user-001`

### Step 2 — Login via API and get session token

```javascript
const res = await fetch('http://localhost:3001/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'e2e@cliptale.test', password: 'TestPassword123!' }),
});
const { token } = await res.json();
```

### Step 3 — Set token in browser localStorage before navigating

```javascript
await page.goto('http://localhost:5173');
await page.evaluate((t) => localStorage.setItem('auth_token', t), token);
await page.goto('http://localhost:5173');
```

**Why:** Registration is rate-limited (5/hour/IP). Seeding via SQL bypasses that. The test user is permanent and reusable across all test runs.

**How to apply:** Every playwright test script must seed + login before testing authenticated routes. Never toggle APP_DEV_AUTH_BYPASS.
