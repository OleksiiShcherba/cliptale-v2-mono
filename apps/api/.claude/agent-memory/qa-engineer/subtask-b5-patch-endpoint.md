---
name: Subtask B5 — PATCH /assets/:id endpoint
description: 9 integration tests for asset rename endpoint; full coverage of validation, ownership, and persistence
type: project
---

**Subtask:** B5 — Controller + route: `PATCH /assets/:id` (Asset rename endpoint)

**What was tested:**
- 9 integration tests in `apps/api/src/__tests__/integration/assets-patch-endpoint.test.ts`
- All tests passing (9/9) ✅
- Run command: `APP_DB_PASSWORD=cliptale npx vitest run src/__tests__/integration/assets-patch-endpoint.test.ts`

**Test coverage:**
1. ✅ 400 — missing name parameter (validateBody rejects)
2. ✅ 400 — empty string name (validateBody rejects)
3. ✅ 400 — whitespace-only name (Zod `.trim().min(1)` chain rejects)
4. ✅ 400 — name exceeds 255 characters (validateBody rejects)
5. ✅ 404 — asset does not exist
6. ✅ 404 — asset belongs to different owner (ownership guard in service)
7. ✅ 200 — valid rename with `displayName` in response body
8. ✅ DB persistence — displayName written to `project_assets_current.display_name` column
9. ✅ Whitespace trimming — leading/trailing spaces removed before storage

**Test structure:**
- Uses `APP_DEV_AUTH_BYPASS=true` for hardcoded dev user `dev-user-001`
- Seeded test data: OWNED_ASSET_ID (owned by dev user) and OTHER_ASSET_ID (owned by different user)
- MySQL integration tests (requires docker compose db running)
- Mocked S3 client for presigned URLs

**Implementation files touched:**
- `apps/api/src/controllers/assets.controller.ts` — added `patchAssetSchema` export + `patchAsset` handler
- `apps/api/src/routes/assets.routes.ts` — registered PATCH route with middleware chain

**Regression status:** ✅ CLEAR
- No previously passing tests broken by B5
- Pre-existing failures in assets-endpoints.test.ts and assets-finalize-endpoint.test.ts unrelated to B5

**Reviewed:** 2026-04-12 by qa-reviewer ✅
