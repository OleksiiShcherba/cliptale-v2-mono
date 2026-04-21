---
name: Subtask 5 — Backend pagination regression coverage + OpenAPI client sync
description: Zod schemas in api-contracts package for AssetListResponse envelope; no duplication with service types
type: project
---

**Approved**: All code compliant with architecture rules.

**Key findings:**
- `packages/api-contracts/src/asset-list.schemas.ts` defines Zod schemas for the `AssetListResponse` envelope (items, nextCursor, totals).
- These schemas are NOT duplicates of the TypeScript types in `apps/api/src/services/fileLinks.response.service.ts`. The service defines types for internal use; the contracts package defines Zod schemas for runtime validation at the API boundary. This is correct separation of concerns and single source of truth: Zod schemas are canonical for contract validation.
- Test split is correct: original pagination test was 401 lines (exceeds 300), split into `projects-assets-pagination.test.ts` and `projects-assets-pagination.contract.test.ts` (154 lines, well under cap).
- Integration test uses real MySQL + supertest (not direct fetch), per §5 & §8.
- No env reads outside integration test setup (which is acceptable).
- All imports are absolute or same-folder relative; no cross-boundary relative imports.
- Types use `type` keyword (domain types), not `interface` or Props forms, per §9.

**Why:** Zod-as-contract approach is cleaner than duplicating response types in both the service layer and contracts package. The Zod schema is the single source of truth that validates wire responses.

**How to apply:** Future pagination/envelope changes should update the Zod schema in `asset-list.schemas.ts` as the canonical source; service types can follow if needed for internal documentation.
