---
name: Zod request-body schema placement — CORRECTED RULING
description: Single-use request-body schemas belong in their controller and are re-exported for routes; shared schemas (auth) belong in middleware
type: project
---

**WITHDRAWN** — Earlier interpretation was incorrect. Section 11 does NOT prohibit defining Zod schemas in controller files.

§11 lines 730–734 state: "Validate ALL incoming request bodies at the API boundary using Zod schemas in `apps/api/src/middleware/validate.middleware.ts`." This sentence describes the location of the *validator middleware function* (`validateBody`), NOT the location of the Zod schema definitions themselves.

**Correct pattern** (confirmed by codebase inspection 2026-04-09):
- Single-use request-body schemas → defined and exported from `*.controller.ts` (e.g., `assets.controller.ts:10`, `renders.controller.ts:7`, `aiGeneration.controller.ts:13`)
- Shared schemas (auth: login, signup, password reset, verify email, etc.) → defined in `middleware/auth.schema.ts` because they are used by multiple controllers
- When shapes overlap with ProjectDoc → import or align with `packages/project-schema/`

**Why:** The codebase has a consistent pattern: single-use schemas live with their controller, shared schemas live in middleware. This is not a violation of §11; it is the intended structure. The earlier flag in EPIC 8 subtask 3 was based on a misreading of the rule.

**How to apply:** Do NOT flag Zod schemas exported from controllers. Only flag if a schema is used by `validateBody` but is defined in an incorrect location (e.g., an auth-like shared schema defined in a controller instead of middleware, or a schema that should be in project-schema but is hardcoded in the controller).
