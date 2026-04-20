---
name: Asset List Mobile Display Bug
description: iPhone mobile viewport shows empty asset list despite backend having 3 assets; suspected CORS/auth/cache issue
type: project
---

## Issue Summary

**Date:** 2026-04-20
**User Report:** On iPhone mobile viewport, asset upload shows "success" but file doesn't appear in asset list.
**Backend Status:** ✅ Assets saved correctly (verified via API)
**Frontend Status:** ❌ List shows empty state instead of cards

## Verified Facts

- **Backend API:** Returns 3 assets (2 IMG_4007.png status='ready', 1 diag-test.png status='pending')
- **API URL:** Correctly configured as `https://api.15-236-162-140.nip.io` in web-editor container
- **Mobile Layout:** Math is correct — container should have ~137px vertical space for asset list on iPhone 14 Pro
- **Code:** AssetBrowserPanel.tsx renders correctly; React Query invalidation logic is sound
- **E2E Testing:** Blocked by authentication on production deployment (no test credentials available)

## Root Cause Candidates (Priority Order)

1. **Network Fetch Failure (60%)** — Assets API GET request fails with 401/403/500
   - Could be CORS misconfiguration
   - Could be session token expiry
   - Could be authorization issue on production

2. **React Query Cache Not Updating (20%)** — Upload succeeds but invalidation doesn't trigger
   - `onUploadComplete` callback not called
   - queryKey mismatch between fetch and invalidation

3. **Mobile CSS Bug (15%)** — Container height collapses despite flex:1
   - Parent layout preventing flex expansion
   - Unlikely given styles are correct

4. **Auth Token Stale (5%)** — Token valid on upload, expired on subsequent fetch

## Investigation Steps for User

### Immediate (DevTools)

1. Open Safari DevTools on iPhone
2. Upload a file and watch Network tab
3. Look for GET `/projects/{projectId}/assets`:
   - Status 200 + JSON response = fetch works, issue is in React
   - Status 401/403 = auth issue
   - Status 500 = backend error
   - CORS error = API config issue

4. In Console, run:
   ```javascript
   fetch('https://api.15-236-162-140.nip.io/projects/{id}/assets', {
     headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
   }).then(r => r.json()).then(d => console.log(d));
   ```

### If Network Shows 200 OK
- Issue is in AssetBrowserPanel data handling
- Reproducible in test environment (localhost:5173 with seeded user)
- File: `apps/web-editor/src/features/asset-manager/components/AssetBrowserPanel.tsx`

### If Network Shows Error Status
- Issue is backend/API configuration
- Check: `APP_CORS_ORIGIN` in production `.env`
- Check: Session token validity on mobile device

## Next Steps

1. Collect DevTools network trace from user
2. If 200 OK: Reproduce in local test environment with seeded data
3. If error: Inspect production API configuration and logs
4. Create proper test case with mobile viewport that verifies asset fetch + render

## Why E2E Test Failed

- Production enforces real authentication (no `APP_DEV_AUTH_BYPASS`)
- Playwright browser had no valid session cookies or tokens
- Could not reach login endpoint through browser auth flow
- Would need either: (a) user's session token, (b) production test credentials, or (c) local docker-compose test

## Related Files

- `apps/web-editor/src/features/asset-manager/components/AssetBrowserPanel.tsx` — main component
- `apps/web-editor/src/App.tsx` — mobile layout wrapper
- `apps/web-editor/src/App.styles.ts` — mobile flex layout definitions
- `apps/web-editor/src/App.panels.tsx` — MobileTabContent wrapper
- `apps/api/src/index.ts` — CORS configuration (if issue is network)

## Why:** User is experiencing a regression or environment-specific issue on production. Need to isolate whether it's network/auth or component state.

## How to apply:** Before declaring a fix valid, test on actual mobile device with production deployment OR create test case that reproduces the issue locally.
