---
status: Draft
owner: "Architect / Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-03"
feature_size: "L"
target_surfaces: []  # filled in §4 — subset of: backend-service | web-frontend | mobile-app | desktop-app | cli | worker | library-sdk. Read (never re-derived) by api/sequences/tasks/plan-tests/review → _shared/surfaces.md
---

# Software Architecture Document — generate-ai-flow

<!-- 12 Arc42 sections. Empty section → N/A: reason. -->
<!-- C4 Context (L1) lives inline in §3. C4 Container (L2) lives inline in §5. -->
<!-- Numbers in §10 come VERBATIM from spec.md §6 NFR — no inventing, no rounding. -->

## 1. Introduction and goals

**Intent.** generate-ai-flow gives a Creator a dedicated, visual, node-based "Generate AI" workspace to freely combine the existing catalog of AI models across text, image, video, and audio. The Creator assembles content blocks and generation blocks on a flow canvas, draws **typed connections** that are blocked at connect-time when modalities don't match, presses **Generate** one block at a time after a cost confirmation, and every result is auto-saved as a reusable asset in the Creator's general library, linked back to the flow. It reuses — not replaces — the existing single-model generation experience (spec §1, §3).

**Top-3 quality goals (1-liners; full scenarios in §10):**

1. **Cost-safety / financial integrity** — no paid provider call is ever made without a satisfied-required-inputs check, a cost confirmation, and a server-side per-Creator rate limit; a result asset enters the library only on a successful generation (spec §2, §6.1, §6).
2. **Owner-scoped confidentiality** — every flow list/read/write/delete and every Generate action is filtered by the calling Creator's identity; a non-owner gets no access and no existence disclosure (spec §6.1, AC-04/AC-05).
3. **Durability across sessions and async** — a flow (blocks, connections, parameters, results) and an in-flight generation survive reload, tab-close, and conflicting concurrent saves with no lost work and no lost outcome (spec §5 AC-08b/AC-10/AC-10b).

*(Canvas responsiveness — open ≤1500 ms, connection feedback ≤100 ms — is a real NFR but secondary to the three above; it is carried as a quality scenario in §10.)*

**Stakeholders.**

| Role | Interest | Sign-off owner? |
|---|---|---|
| Creator | Builds and runs generation flows; owns all flows and result assets | No |
| Tech Lead | SAD approval; owns the cost/validation/persistence architecture | Yes |
| Security Lead | New owner-scoped resource + financial-abuse (uncapped paid generation) vector | Yes |
| Product / Business owner | Rate-limit / quota / refund policy (spec §8 open questions) | No |

<!-- Decision overrides (¶4) — populated by the critic resolution loop, empty otherwise. -->

## 2. Constraints

*(Fixed inputs inherited from `docs/architecture-map.md` @ `reflects_commit 9f943df` — the brownfield this feature extends. Pinned, not chosen.)*

**Technical.**
- **Language / runtime:** TypeScript 5.4+ (strict, ESM), Node ≥ 20; Turborepo + npm-workspaces monorepo (`apps/*`, `packages/*`).
- **API:** Express 4 + Helmet + CORS + express-rate-limit + Zod; `ws` WebSocket realtime.
- **Frontend:** React 18 + Vite 5 + React-Router v7 + TanStack Query 5 + Immer; custom external store + `useSyncExternalStore` (no Zustand/Redux). Node canvas via **`@xyflow/react`** (the storyboard editor is the precedent).
- **Datastores:** MySQL 8 / InnoDB via `mysql2` raw parameterized SQL (no ORM); Redis 7 (BullMQ queues + realtime pub/sub channel `cliptale:realtime:v1`); S3 (AWS SDK v3, presigned upload/read URLs).
- **Workers:** BullMQ 5; generation runs on the **existing `media-worker`** (fal.ai + ElevenLabs) — no new worker container.
- **Architecture convention:** `routes → controllers → services → repositories`; module singletons (`pool`, `redis`, `s3`, `config`) imported directly — **no DI container**.

**Organisational.**
- **Effort / deadline:** not fixed at design time; no hard external release deadline.
- **Team:** the existing ClipTale fullstack team (no new headcount assumed).
- **Size:** L (per `.size`) — 10–15 ADRs expected for the feature.

**Conventions.**
- Canonical: `docs/architecture-map.md` (generated) + `docs/architecture-rules.md` (authored).
- **IDs:** UUID v4 via `randomUUID()` (`node:crypto`), stored `CHAR(36)`, validated `z.string().uuid()`. (Not ULID — `general_idea.md`'s ULID note is aspirational and contradicts live code.)
- **Errors:** typed classes in `apps/api/src/lib/errors.ts` (`ValidationError` 400, `NotFoundError` 404, `UnauthorizedError` 401, `ForbiddenError` 403, `ConflictError`/`OptimisticLockError` 409, `UnprocessableEntityError` 422, `GoneError` 410); central handler maps `err.statusCode`.
- **Migrations:** numbered SQL `NNN_description.sql` in `apps/api/src/db/migrations/` (next after `045`); in-process runner, `IF NOT EXISTS`-guarded; soft-deletes via `deleted_at IS NULL`.
- **API contract:** OpenAPI hand-maintained in `packages/api-contracts/src/openapi.ts` — no codegen; update spec + impl in the same commit.
- **Model catalog:** `packages/api-contracts` — `AI_MODELS` (`FalModel | ElevenLabsModel`), `capability` + per-field `required`/`type`; a new model/capability extends these catalogs.
- **UI / styling:** plain inline `CSSProperties` in co-located `*.styles.ts` (no Tailwind/CSS-modules/styled-components); tokens per `docs/design-guide.md`.
- **Config:** `apps/*/src/config.ts` is the only place reading `process.env`; vars `APP_*`, Zod-validated.

**Regulatory / external.**
- **Data classification:** confidential — flows + results are private creative work; no new personal-data fields introduced (spec §6.1). **Security review required.**
- **Paid third-party providers** (fal.ai, ElevenLabs): every Generate is a spend-bearing call → a financial-abuse vector that must be capped server-side (spec §6.1 abuse cases), not in the UI alone.

## 3. Context and scope

<!-- pending Socratic walk -->

## 4. Solution strategy

<!-- pending Socratic walk -->

## 5. Building block view

<!-- pending Socratic walk -->

## 6. Runtime view

<!-- pending Socratic walk -->

## 7. Deployment view

<!-- pending Socratic walk -->

## 8. Crosscutting concepts

<!-- pending Socratic walk -->

## 9. Architecture decisions

<!-- pending Socratic walk -->

## 10. Quality requirements

<!-- pending Socratic walk -->

## 11. Risks and technical debt

<!-- pending Socratic walk -->

## 12. Glossary

<!-- pending Socratic walk -->
