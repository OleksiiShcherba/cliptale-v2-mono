---
name: Project: Home Hub EPIC progress
description: EPIC — Home: Projects & Storyboard Hub; 7 subtasks; subtasks 1-4 complete as of 2026-04-17
type: project
---

EPIC: Home — Projects & Storyboard Hub (replaces /editor as post-login landing).

Build order: 1 → 2 (must land together re createProject sig). 3 is independent. 4 independent. 5 requires 2+4. 6 requires 3+4. 7 independent, ships last.

**Subtask 1** — COMPLETE (2026-04-17)
- Migration: `apps/api/src/db/migrations/020_projects_owner_title.sql`
- Integration test: `apps/api/src/__tests__/integration/projects-schema.test.ts`
- Key pattern: MySQL 8.0 does NOT support `ADD COLUMN IF NOT EXISTS` or `CREATE INDEX IF NOT EXISTS`. Use `INFORMATION_SCHEMA` guards + `PREPARE/EXECUTE` for idempotent DDL.

**Subtask 2** — COMPLETE (2026-04-17)
- Modified: `apps/api/src/repositories/project.repository.ts` — widened `createProject(id, userId, title?)`, added `findProjectsByUserId(userId)` with correlated subquery for thumbnail derivation.
- Modified: `apps/api/src/services/project.service.ts` — widened `createProject(userId, title?)`, added `listForUser(userId)`.
- Modified: `apps/api/src/controllers/projects.controller.ts` — new `listProjects` handler, updated `createProject` to pass userId.
- Modified: `apps/api/src/routes/projects.routes.ts` — `GET /projects` registered with auth + ACL; `POST /projects` also gets ACL.
- Modified: `packages/api-contracts/src/openapi.ts` — added `/projects` GET+POST paths + `ProjectSummary`/`ListProjectsResponse`/`CreateProjectBody` schemas.
- Created: `apps/api/src/repositories/project.repository.test.ts` (8 unit tests).
- Modified: `apps/api/src/services/project.service.test.ts` (extended with listForUser + updated createProject tests).
- Created: `apps/api/src/__tests__/integration/projects-list-endpoint.test.ts` (13 integration tests, real MySQL with real sessions).

Key decisions for subtask 2:
- Integration tests seed real sessions (sha256 token hashes matching `auth.service.ts hashToken()`) to test user isolation — can't use dev auth bypass for multi-user tests.
- thumbnailUrl SQL: correlated subquery on `project_clips_current JOIN project_assets_current` with `type IN ('video', 'image')` and `ORDER BY start_frame ASC, clip_id ASC LIMIT 1`.
- `aclMiddleware('editor')` now applied to both GET and POST `/projects` — was missing from POST before.

**Subtask 3** — COMPLETE (2026-04-17)
- `GenerationDraftStatus` type + `status` field added to `GenerationDraft` type AND all SELECT queries in `generationDraft.repository.ts` (was missing before — DB column existed in migration 019 but repository type didn't expose it).
- Added `findStoryboardDraftsForUser(userId)` and `findAssetPreviewsByIds(assetIds[])` to repository.
- Added `listStoryboardCardsForUser(userId)` to service: batch-fetches assets in one query (not N queries), silently skips dangling refs, caps mediaPreviews at 3 before batching.
- Route registered BEFORE `/:id` in `generationDrafts.routes.ts`.
- New files: `generationDraft.cards.service.test.ts` (13 unit tests), `generation-drafts-cards-endpoint.test.ts` (12 integration tests).
- OpenAPI: added `/generation-drafts/cards` path + `MediaPreview`, `StoryboardCardSummary`, `ListStoryboardCardsResponse` schemas.

**Subtask 4** — COMPLETE (2026-04-17)
- Created: `apps/web-editor/src/features/home/types.ts`, `api.ts` (stub), `components/HomeSidebar.tsx`, `components/HomePage.tsx`.
- Modified: `apps/web-editor/src/main.tsx` — added `{ path: '/' }` ProtectedRoute for HomePage; changed `*` fallback from `/editor` to `/`; preserved `/generate/road-map`.
- Modified: `apps/web-editor/src/features/auth/components/LoginPage.tsx` — post-login navigate from `/editor` to `/`.
- Created: `apps/web-editor/src/features/home/components/HomePage.test.tsx` (6 tests).
- Modified: `apps/web-editor/src/features/auth/components/LoginPage.test.tsx` — updated navigate assertion to `/`.
- All tests pass (12 total).

Key implementation notes for subtask 4:
- `HomeSidebar` uses `<button role="tab" aria-selected>` pattern inside `<nav>` — accessible tab-list semantics without `<ul role="tablist">` wrapping conflict.
- `HomePage` keeps `activeTab` as local `useState<HomeTab>` — no URL sync per AC (subtask 4 scope).
- `<main role="tabpanel" aria-labelledby>` connects to the sidebar tab via matching `id` pattern (`tab-${id}` / `panel-${id}`).
- Tokens used: SURFACE_ALT `#16161F`, PRIMARY_LIGHT `#4C1D95`, TEXT_PRIMARY `#F0F0FA`, TEXT_SECONDARY `#8A8AA0`, BORDER `#252535`.

**Subtask 5** — COMPLETE (2026-04-17)
- Modified: `apps/web-editor/src/features/home/types.ts` — added `ProjectSummary` type.
- Modified: `apps/web-editor/src/features/home/api.ts` — real `listProjects()` + `createProject(title?)`.
- Created: `apps/web-editor/src/features/home/hooks/useProjects.ts` — query key `['home', 'projects']`.
- Created: `apps/web-editor/src/features/home/components/ProjectCard.tsx` — thumbnail|placeholder SVG, relative date, navigate on click/Enter/Space.
- Created: `apps/web-editor/src/features/home/components/ProjectsPanel.tsx` — loading/error/empty/populated states, responsive 3/2/1 grid, create mutation with disabled button + inline error.
- Modified: `apps/web-editor/src/features/home/components/HomePage.tsx` — replaced ProjectsStub with real ProjectsPanel.
- Modified: `apps/web-editor/src/features/home/components/HomePage.test.tsx` — added QueryClientProvider wrapper, mocked useProjects (empty list) to avoid needing a server.
- 23 new tests (3 files) + updated HomePage.test.tsx = 29 tests total in home feature.

Key notes for subtask 5:
- `formatRelativeDate.ts` already existed — no new file needed.
- Grid responsiveness uses `window.innerWidth` + `resize` event listener in `useEffect` (inline styles can't use media queries).
- `HomePage.test.tsx` now requires `QueryClientProvider` because `ProjectsPanel` calls `useQuery`. If future stubs similarly use React Query, the wrapper pattern must be continued.

**Subtask 6** — COMPLETE (2026-04-17)
- Extended `types.ts` — added `MediaPreview` and `StoryboardCardSummary` types.
- Extended `api.ts` — added `listStoryboardCards()` hitting `GET /generation-drafts/cards`.
- Created: `hooks/useStoryboardCards.ts` — query key `['home', 'storyboards']`.
- Created: `components/StoryboardPanelParts.tsx` — `StoryboardSkeletonCard` + `StoryboardErrorState`.
- Created: `components/StoryboardCard.tsx` — status badge (warning=#F59E0B for step2/step3, success=#10B981 for completed, text-secondary=#8A8AA0 for draft), text preview clamped at 140 chars/2 lines, media-preview row (max 3 thumbs, 56×56 radius-sm), Resume button.
- Created: `components/StoryboardPanel.tsx` — loading/error/empty/populated states; responsive 3/2/1 grid; Create CTA → `/generate`.
- Modified: `components/HomePage.tsx` — replaced `StoryboardStub` with real `StoryboardPanel`.
- Modified: `components/HomePage.test.tsx` — added `useStoryboardCards` mock + `listStoryboardCards` to api mock.
- 30 new tests; all 59 home feature tests pass.

Key notes for subtask 6:
- Both the outer card `div` (role=button) and inner Resume `<button>` both navigate — outer has aria-label "Resume storyboard: <text>...", inner has "Resume storyboard draft". Tests must use `^resume storyboard:` to target the outer card exclusively.
- `HomePage.test.tsx` requires both `useProjects` and `useStoryboardCards` mocks (plus `listStoryboardCards` in the api mock) because `StoryboardPanel` is now live.

**Subtask 7** — COMPLETE (2026-04-17)
- Modified: `apps/web-editor/src/features/generate-wizard/api.ts` — added `fetchDraft(id)` alongside existing helpers.
- Modified: `apps/web-editor/src/features/generate-wizard/hooks/useGenerationDraft.ts` — signature changed from `(initial?: PromptDoc)` to `(options?: UseGenerationDraftOptions)`; added hydrate `useEffect` for `initialDraftId`.
- Modified: `apps/web-editor/src/features/generate-wizard/components/GenerateWizardPage.tsx` — wired `useSearchParams` + passes `{ initialDraftId }` to `useGenerationDraft`.
- Updated: `useGenerationDraft.test.ts` and `.timing.test.ts` — call sites from `useGenerationDraft(DOC)` → `useGenerationDraft({ initial: DOC })`.
- Created: `useGenerationDraft.hydrate.test.ts` (4 tests: hydrate, PUT-not-POST, 404 fall-through, fresh-start).
- Extended: `GenerateWizardPage.test.tsx` — added fetchDraft mock, updated useGenerationDraft mock, added `?draftId=abc` test case.

Key notes for subtask 7:
- Hook signature change from positional PromptDoc arg to options object — all existing test call sites must be updated when extending test files.
- `DEBOUNCE_MS = 800` is unchanged; existing timing tests cover the regression gate.
- `cancelled` flag in hydrate `useEffect` cleanup prevents setState-after-unmount for slow fetches.

**Why:** DELIMITER-bracketed stored procedures don't work with mysql2 multipleStatements (mysql2 splits on `;`). The PREPARE/EXECUTE pattern is the correct approach that works in both execution contexts.

**How to apply:** Subtask 5 needs real `listProjects` + `createProject` in `features/home/api.ts` + `hooks/useProjects.ts`. Subtask 6 needs real `listStoryboardCards` + `hooks/useStoryboardCards.ts`. Both replace stub panels in `HomePage.tsx`.
