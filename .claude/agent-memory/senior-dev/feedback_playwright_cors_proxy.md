---
name: Playwright CORS proxy pattern for deployed E2E
description: page.route() fulfill still triggers browser CORS; must set access-control-allow-origin in fulfilled response headers
type: feedback
---

When using Playwright's `page.route()` to proxy browser requests to a different API (to work around CORS), the `route.fulfill()` response still goes through the browser's CORS policy. Simply fulfilling with the proxied response is NOT enough — the browser checks the `access-control-allow-origin` header on the FULFILLED response too.

**Why:** Playwright route interception happens at the network layer, but the response headers are still evaluated by the browser for CORS. If the proxied API returns `Access-Control-Allow-Origin: http://localhost:5173` but the page is at `https://15-236-162-140.nip.io`, the browser blocks it even though Playwright fulfilled it.

**How to apply:** When proxying API responses via page.route() + route.fulfill(), always override CORS headers:
```typescript
await route.fulfill({
  status: proxyRes.status(),
  headers: {
    ...proxyRes.headers(),
    'access-control-allow-origin': '*',
    'access-control-allow-credentials': 'true',
  },
  body: await proxyRes.body(),
});
```

The `page.request.fetch()` call (which does the actual network request in the route handler) bypasses browser CORS — that part works. But the fulfilled response must have permissive CORS headers for the browser to accept it.
