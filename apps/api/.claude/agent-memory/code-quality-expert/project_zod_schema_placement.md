---
name: Zod request-body schema placement
description: Zod schemas for API request-body validation must not live in controller files; Section 11 requires them in validate.middleware.ts or packages/project-schema
type: project
---

Zod schemas used as arguments to `validateBody()` must NOT be defined or exported from `*.controller.ts` files. Section 11 of architecture-rules.md states: "Validate ALL incoming request bodies at the API boundary using Zod schemas in `apps/api/src/middleware/validate.middleware.ts`" and "The Zod schemas used for API validation MUST be imported from or aligned with `packages/project-schema/`."

Correct placements:
- Simple auth/input schemas with no overlap with ProjectDoc → `apps/api/src/middleware/validate.middleware.ts` (inline or as named exports)
- Schemas that overlap with ProjectDoc shapes → `packages/project-schema/`

**Why:** Flagged as a violation in EPIC 8 subtask 3 (2026-04-07) when `registerSchema` and `loginSchema` were exported from `auth.controller.ts` and imported by `auth.routes.ts`.

**How to apply:** Any time a Zod schema is found exported from a `*.controller.ts` file and used for request-body validation, flag it as a Section 11 violation.
