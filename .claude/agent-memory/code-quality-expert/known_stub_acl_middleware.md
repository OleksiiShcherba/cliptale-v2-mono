---
name: Known stub — ACL middleware is intentionally incomplete
description: Do not flag acl.middleware.ts as missing real ownership checks; it is a documented deferred item
type: project
---

`apps/api/src/middleware/acl.middleware.ts` is an auth-presence stub only. Real project ownership and role checks are deferred until the projects CRUD epic is implemented.

**Why:** Noted explicitly in `development_logs.md` under "Known Issues / TODOs": "ACL middleware is a stub — real project ownership check deferred to projects CRUD epic".

**How to apply:** Do not flag missing ownership logic in `acl.middleware.ts` as a violation. If a new route adds `aclMiddleware` but the middleware still only checks auth presence, that is acceptable until the projects CRUD epic ships.
