● EPIC: Home — Projects & Storyboard Hub

  Goal: Ship a new post-login `/` page that serves as the central hub for authenticated users. The page has a left sidebar with two tabs — **Projects** (grid of the user's video projects with previews + "Create New Project" CTA) and **Storyboard** (list of the user's in-flight `Video Generation By Prompt` drafts with status, text preview, up to 3 media previews, plus Resume and "Create Storyboard" CTAs). Clicking a project card opens `/editor?projectId=<id>`; clicking a storyboard card opens `/generate?draftId=<id>` and hydrates the wizard from the saved draft. Design source of truth: Stitch screens `ClipTale Dashboard` (`a0801430836341b0ae811460bd9623bc`) and `Storyboard List` (`b09435aa6f9a43ba8d172d21c95d353d`).

  Persona: Authenticated end-user (creator) landing in the product after login. Today they are dropped straight into the editor with no way to see or switch projects/storyboards.

  Constraints:
  - Requires `authMiddleware` + `aclMiddleware('editor')` on every new API route.
  - Post-login redirect moves from `/editor` to `/`. Existing `/editor?projectId=X` continues to work.
  - No new third-party dependencies. Reuse React Query, existing `apiClient`, existing asset thumbnail pipeline.
  - All development testing runs through Docker Compose per project workflow memory.
  - Every ticket under the §9.7 300-line cap; split test files via the `.fixtures.ts` + `.<topic>.test.ts` pattern when needed.

  ---
  Pages / Surfaces

  - `/` HomePage — left sidebar (Projects / Storyboard tabs) + main content region. Replaces `/editor` as the default landing route.
  - Projects tab — 3-col desktop / 2-col tablet / 1-col mobile grid of `ProjectCard`s + "Create New Project" header CTA.
  - Storyboard tab — vertical list (or 2-col grid) of `StoryboardCard`s + "Create Storyboard" header CTA.
  - `/generate?draftId=<id>` (extended) — resume mode that hydrates existing draft rather than starting fresh.

  ---
  Tickets

  🔵 Backend First

  ---
  [DB] Add owner_user_id + title + updated_at to projects table

  Description
  The `projects` table currently has no owner link, no name, and no explicit `updated_at` column beyond the one already present (003_project_versions.sql has `updated_at ON UPDATE`). Add `owner_user_id CHAR(36) NOT NULL` and `title VARCHAR(255) NOT NULL DEFAULT 'Untitled project'`, plus a composite index `(owner_user_id, updated_at DESC)` to back the Dashboard list query. ⚠️ Backfill: assign existing rows to the dev-seed user id from `011_seed_dev_user.sql` (or NULL-allowed ALTER then a targeted UPDATE then `MODIFY COLUMN ... NOT NULL` — whichever is idempotent under `CREATE TABLE IF NOT EXISTS` semantics). File: `apps/api/src/db/migrations/020_projects_owner_title.sql`.

  Acceptance Criteria
  - Migration file `020_projects_owner_title.sql` exists and is idempotent (safe to run on a DB that already has the columns).
  - After running on an empty DB (`docker compose down -v && docker compose up`), `DESCRIBE projects;` shows `owner_user_id CHAR(36) NOT NULL`, `title VARCHAR(255) NOT NULL DEFAULT 'Untitled project'`, and the pre-existing `updated_at` column.
  - After running on a DB seeded by `006_seed_dev.sql` + `011_seed_dev_user.sql`, every pre-existing `projects` row has its `owner_user_id` set to the seed user's id and a non-null `title`.
  - Index `idx_projects_owner_updated` on `(owner_user_id, updated_at DESC)` exists and is used by `EXPLAIN SELECT ... WHERE owner_user_id = ? ORDER BY updated_at DESC`.
  - Down path documented as an `-- Manual rollback:` comment block in the migration file.

  Reuse hint
  `apps/api/src/db/migrations/003_project_versions.sql` — defines current projects table — extension point (add columns; do not re-create).
  `apps/api/src/db/migrations/011_seed_dev_user.sql` — source of seed user id for backfill.

  Test approach
  `apps/api/src/__tests__/integration/projects-schema.test.ts` (new) — hits `INFORMATION_SCHEMA.COLUMNS` and `STATISTICS` to assert (1) the two new columns exist with the expected types/defaults, (2) the composite index exists, (3) any pre-existing row has `owner_user_id` populated.

  Risk
  high — migration + backfill on the core `projects` table; breaks `POST /projects` consumers until the follow-on BE ticket lands.

  Dependencies None.
  Effort S

  ---
  [BE] Projects list slice — repo + service + controller + route + OpenAPI

  Description
  Wire the Dashboard backend in one slice so the list endpoint has no loose ends. In `project.repository.ts` add `findProjectsByUserId(userId): ProjectSummary[]` returning `{ projectId, title, thumbnailUrl | null, updatedAt }`, deriving `thumbnailUrl` by left-joining `project_clips_current` → `project_assets_current` to pick the earliest video or image clip's `thumbnail_url` (order by `start_frame ASC` then `clip_id ASC`; return `null` when no visual clip exists). In `project.service.ts`, add `listForUser(userId)` and change `createProject()` to `createProject(userId, title?)` — persist ownership and a default title on insert. In `projects.controller.ts`, add a `listProjects` handler and update `createProject` to pass `req.user!.userId`. Register `GET /projects` in `projects.routes.ts` (auth + `aclMiddleware('editor')`). Add `GET /projects` and update `POST /projects` schemas in `packages/api-contracts/src/openapi.ts`. ⚠️ `POST /projects` request body gains an optional `title` — keep it optional so existing callers in `useProjectInit.ts` continue to work without changes.

  Acceptance Criteria
  - `GET /projects` returns `200 { items: ProjectSummary[] }` sorted by `updated_at DESC` for the authenticated user; other users' projects are not visible.
  - `POST /projects` accepts `{ title?: string }`, persists `owner_user_id = req.user.userId` and `title = body.title ?? 'Untitled project'`, and returns `{ projectId }` with status 201.
  - Unauthenticated requests return 401; authenticated-but-missing-editor-role requests return 403.
  - `ProjectSummary.thumbnailUrl` is the first video/image clip's `thumbnail_url` when present, else `null` — deterministic across repeat calls.
  - OpenAPI `GET /projects` + updated `POST /projects` round-trip through the `openapi.ts` spec without breaking the existing build.
  - Service functions accept the user id as a parameter — no `req` / no `config` inside the service.

  Reuse hint
  `apps/api/src/repositories/project.repository.ts` — already exports `createProject(projectId)` — extension point (add `findProjectsByUserId`, widen `createProject` signature).
  `apps/api/src/repositories/asset.repository.list.ts` — pagination+cursor shape reference if pagination is added later (not required now).
  `apps/api/src/services/project.service.ts` — thin shell today — extension point.

  Test approach
  `apps/api/src/services/project.service.test.ts` — extend with happy-path `listForUser`, ownership isolation, and updated `createProject(userId, title)` assertions.
  `apps/api/src/repositories/project.repository.test.ts` (new) — unit tests on the repo with mocked `pool.query` for the join + ORDER BY; `__tests__/integration/projects-list-endpoint.test.ts` — integration test with real MySQL: seed 2 users × 2 projects, assert isolation + thumbnail derivation from a seeded `project_clips_current` row.

  Risk
  med — depends on the migration landing first; changes the in-memory shape of the create-project service call, which is consumed by `useProjectInit.ts`.

  Dependencies [DB] Add owner_user_id + title + updated_at to projects table
  Effort M

  ---
  [BE] Storyboard cards endpoint — GET /generation-drafts/cards

  Description
  Add a new endpoint `GET /generation-drafts/cards` that returns a card-friendly summary per draft: `{ draftId, status, textPreview, mediaPreviews: [{ assetId, type, thumbnailUrl }], updatedAt }`. `textPreview` is the first N characters (N=140) of all concatenated `TextBlock` contents in `prompt_doc`. `mediaPreviews` is the first 3 `MediaRefBlock`s resolved through `project_assets_current` for `thumbnail_url` and `asset_type`. Add a dedicated service function `listStoryboardCardsForUser(userId)` in `generationDraft.service.ts`. ⚠️ Asset resolution must swallow missing assets silently (asset might have been deleted) and simply omit them from the previews array — never 500 on the list endpoint. Keep the existing `GET /generation-drafts` raw-drafts endpoint untouched to avoid breaking future callers.

  Acceptance Criteria
  - `GET /generation-drafts/cards` returns `200 { items: StoryboardCardSummary[] }` sorted by `updated_at DESC`.
  - Each item contains `draftId`, `status ∈ {'draft','step2','step3','completed'}`, `textPreview ≤ 140 chars`, `mediaPreviews.length ≤ 3`, `updatedAt`.
  - Missing assets referenced by a draft are silently omitted from `mediaPreviews`; the endpoint does not throw 500.
  - Drafts belonging to other users are not returned (ownership filter in repo SQL).
  - Auth + ACL middleware applied identically to sibling draft routes.
  - OpenAPI `StoryboardCardSummary` + path schema added to `packages/api-contracts/src/openapi.ts`.

  Reuse hint
  `apps/api/src/services/generationDraft.service.ts` — `listMine` already exists — extension point (add `listStoryboardCardsForUser` alongside, do not replace).
  `apps/api/src/services/aiGeneration.assetResolver.ts` — asset-id → URL resolver — read for the resolution pattern; a purpose-built lookup fits better here than reusing this (it's tied to presigned URL flow).
  `apps/api/src/repositories/asset.repository.ts` — has `getAssetById` style accessors to fetch `thumbnail_url` + `asset_type`.

  Test approach
  `apps/api/src/services/generationDraft.cards.service.test.ts` (new, sibling of existing `generationDraft.service.test.ts`) — unit tests covering text-preview truncation, media-preview cap at 3, missing-asset skip, status passthrough, ownership.
  `apps/api/src/__tests__/integration/generation-drafts-cards-endpoint.test.ts` — integration test hitting the route with a seeded user + draft containing 5 media refs (expect 3 returned) + 1 ref to a deleted asset (expect skipped).

  Risk
  med — joins across two tables with a client-side iteration over media refs; must keep under the 140-char truncation rule and asset-not-found guard.

  Dependencies None (independent of the projects migration).
  Effort M

  ---
  🟢 Can Be Parallelised (Frontend)

  ---
  [FE] HomePage shell + routing + sidebar nav

  Description
  Add `apps/web-editor/src/features/home/components/HomePage.tsx` with a two-column layout: `HomeSidebar.tsx` on the left (brand mark + 2 nav items: Projects, Storyboard; active-state styling per `design-guide.md §3` `primary-light` on active; bottom profile slot stub) and an empty content region on the right. Track active tab in local state (not URL) — simpler for this step; URL sync is a later polish. Wire the route in `apps/web-editor/src/main.tsx`: add `{ path: '/', element: <ProtectedRoute><HomePage /></ProtectedRoute> }`, change the `*` fallback from `/editor` to `/`, and update `LoginPage`'s post-login `navigate(...)` target from `/editor` to `/`. No data yet — this ticket only ships the shell so the two panel tickets can slot in.

  Acceptance Criteria
  - New files live under `apps/web-editor/src/features/home/` (components/, hooks/, api.ts, types.ts) per `architecture-rules.md §3`.
  - `HomePage.tsx` renders the sidebar + a main region; active tab state drives which stub component renders on the right.
  - Tab nav items use `Projects` (active by default) and `Storyboard`, styled with `surface-alt` background, `text-primary` text, `primary-light` active background token.
  - Router `/` is protected and reachable after login; unauthenticated users hit `/login` via `ProtectedRoute`.
  - Post-login redirect in `LoginPage.tsx` navigates to `/` (verified by manual browser walkthrough inside Docker Compose).
  - `*` fallback in `main.tsx` redirects to `/` (was `/editor`).
  - Matches Stitch tokens from `docs/design-guide.md §3` — colors/typography/spacing align with the ClipTale Dashboard screen.

  Reuse hint
  `apps/web-editor/src/main.tsx` — router config — extension point.
  `apps/web-editor/src/features/auth/components/LoginPage.tsx` — post-login `navigate()` call — needs target change.
  `apps/web-editor/src/App.tsx` — existing two-column layout reference (do not import; read for pattern).
  `apps/web-editor/src/features/generate-wizard/components/GenerateWizardPage.tsx` — reference for protected-page file layout (no logic reuse).

  Test approach
  `apps/web-editor/src/features/home/components/HomePage.test.tsx` (new) — mounts under `MemoryRouter`, asserts (1) both nav items render, (2) clicking `Storyboard` swaps the right-hand stub, (3) active-state class toggles. `LoginPage.test.tsx` — extend to assert `navigate('/')` after successful login.

  Risk
  low — routing-only + static shell; no API calls.

  Dependencies None.
  Effort S

  ---
  [FE] Projects panel — grid, card, create-project flow

  Description
  Inside `features/home/`, implement the Projects tab: `useProjects()` hook (React Query key `['home', 'projects']`, calls `apiClient.get('/projects')`), `ProjectCard.tsx` (thumbnail region with `object-fit: cover` + placeholder SVG when `thumbnailUrl` is null, title, relative `updatedAt` via `formatRelativeDate`, overflow `...` menu stub), `ProjectsPanel.tsx` (header row with page title + primary `Create New Project` button, 3-col desktop / 2-col tablet / 1-col mobile grid using the space-6 token for gaps, empty state with CTA, loading skeleton, error state). Clicking `Create New Project` POSTs to `/projects` and `navigate('/editor?projectId=' + res.projectId)`. Clicking a card navigates to `/editor?projectId=<card.projectId>`. Visual tokens from `design-guide.md §3` and Stitch `ClipTale Dashboard` (`a0801430836341b0ae811460bd9623bc`).

  Acceptance Criteria
  - `useProjects()` returns `{ data, isLoading, isError }`; loading renders 6 skeleton placeholders; error renders the shared error-state component.
  - Empty state renders "No projects yet" copy + the same primary `Create New Project` CTA centered, no grid.
  - `ProjectCard` renders `title`, relative date (e.g. "2 hours ago"), and either the thumbnail image or a placeholder SVG when `thumbnailUrl` is null — never a broken image icon.
  - Create flow: button disabled while the mutation is in flight, navigates to `/editor?projectId=<new>` on success, shows inline error text on failure.
  - Card click: `navigate(`/editor?projectId=${projectId}`)` — no full page reload.
  - Responsive: at viewport ≥1440px grid is 3-col, 768–1439px is 2-col, <768px is 1-col; gaps use `space-6` (24px).
  - No `fetch` calls — everything goes through `apiClient`.

  Reuse hint
  `apps/web-editor/src/features/asset-manager/components/AssetCard.tsx` — card + hover pattern (reference only, do not import across features per §14).
  `apps/web-editor/src/shared/utils/formatTimecode.ts` (add sibling `formatRelativeDate.ts` if missing) — the feature's inline date formatting.
  `apps/web-editor/src/features/generate-wizard/hooks/useGenerationDraft.ts` — mutation+invalidation pattern reference.

  Test approach
  `apps/web-editor/src/features/home/components/ProjectsPanel.test.tsx` — loading / empty / error / populated renders; click-create invokes `apiClient.post('/projects', ...)` and navigates.
  `apps/web-editor/src/features/home/components/ProjectCard.test.tsx` — thumbnail fallback + relative date + click-to-navigate.
  `apps/web-editor/src/features/home/hooks/useProjects.test.ts` — query key stability + error surfacing.

  Risk
  low — new feature, no shared state dependencies.

  Dependencies [BE] Projects list slice, [FE] HomePage shell + routing + sidebar nav
  Effort M

  ---
  [FE] Storyboard panel — card list, create-storyboard, resume

  Description
  Inside `features/home/`, implement the Storyboard tab: `useStoryboardCards()` hook (React Query key `['home', 'storyboards']`, calls `apiClient.get('/generation-drafts/cards')`), `StoryboardCard.tsx` (status badge pill using tokens `warning` for `step2/step3`, `success` for `completed`, `text-secondary` for `draft`; truncated text preview with `text-secondary` ellipsis style; media-preview row showing up to 3 thumbnails with a small count badge `+N` when `mediaPreviews.length > 3` is hinted server-side — not shown here since cap is 3; relative updatedAt; Resume button), `StoryboardPanel.tsx` (header with title + primary `Create Storyboard` CTA, card list/grid, empty state with "Start your first storyboard" CTA, loading skeleton, error state). `Create Storyboard` navigates to `/generate`. Resume / card click navigates to `/generate?draftId=<card.draftId>`. Visual reference: Stitch `Storyboard List` (`b09435aa6f9a43ba8d172d21c95d353d`).

  Acceptance Criteria
  - `useStoryboardCards()` returns `{ data, isLoading, isError }`; loading renders 3 skeleton placeholders.
  - Empty state renders "No storyboards yet" + `Create Storyboard` CTA.
  - `StoryboardCard` renders status badge (color per table above), truncated text preview (≤140 chars, CSS `-webkit-line-clamp: 2`), and the media-preview thumbs row (each 56×56, radius-sm, `object-fit: cover`, placeholder SVG when `thumbnailUrl` is null).
  - `Create Storyboard` button navigates to `/generate` (no draft exists yet — wizard creates one on first edit, per existing behavior).
  - Card click / Resume: `navigate(`/generate?draftId=${draftId}`)`.
  - No `fetch` calls — everything goes through `apiClient`.
  - Responsive behavior mirrors Projects panel (3 / 2 / 1 col at desktop / tablet / mobile).

  Reuse hint
  `apps/web-editor/src/features/generate-wizard/components/AssetThumbCard.tsx` — thumb rendering pattern (reference only, do not cross-import).
  `apps/web-editor/src/features/asset-manager/components/AssetCard.tsx` — card status-badge pattern (reference only).
  `apps/web-editor/src/lib/api-client.ts` — existing `buildAuthenticatedUrl` for thumbnail URLs gated behind auth.

  Test approach
  `apps/web-editor/src/features/home/components/StoryboardPanel.test.tsx` — loading / empty / error / populated renders; Create button navigates; card click navigates with draftId query param.
  `apps/web-editor/src/features/home/components/StoryboardCard.test.tsx` — status badge color mapping; media-preview cap at 3; placeholder SVG on null thumbnail.
  `apps/web-editor/src/features/home/hooks/useStoryboardCards.test.ts` — query key stability + error surfacing.

  Risk
  low — new feature; relies on an already-specified endpoint.

  Dependencies [BE] Storyboard cards endpoint, [FE] HomePage shell + routing + sidebar nav
  Effort M

  ---
  [FE] Wizard resume-draft support (?draftId=<id>)

  Description
  Extend `GenerateWizardPage.tsx` and `useGenerationDraft.ts` so that when the URL contains `?draftId=<id>`, the wizard fetches the existing draft via `GET /generation-drafts/:id` instead of starting a fresh `createDraft` flow. The hook already POST-then-PUTs on the first edit; introduce a "hydrating" branch: if `draftId` is present on mount, load the draft, seed the editor state from `draft.promptDoc`, and set `autosave` to PUT-against-existing-id. ⚠️ If the draft fetch returns 404 or 403, fall back to the fresh-start flow and surface a one-line inline error. No DB or BE changes required — the `GET /generation-drafts/:id` endpoint already exists.

  Acceptance Criteria
  - Navigating to `/generate?draftId=<existing-id>` renders the editor pre-populated with the draft's `promptDoc` content (text + media chips).
  - Subsequent autosaves PUT to `/generation-drafts/<existing-id>` — no new draft row is created.
  - Navigating to `/generate` (no query param) behaves exactly as today: creates a new draft on first edit.
  - Fetch failure (404 / 403) logs at `console.warn` and transparently falls through to the fresh-start flow; no crash, no blank screen.
  - Cancel + Next actions continue to work against the hydrated draft id.
  - No new endpoints introduced; only `features/generate-wizard/api.ts` gains a `fetchDraft(id)` helper.

  Reuse hint
  `apps/web-editor/src/features/generate-wizard/hooks/useGenerationDraft.ts` — core hook — extension point (add hydrate branch).
  `apps/web-editor/src/features/generate-wizard/api.ts` — add `fetchDraft(id)` alongside existing CRUD helpers.
  `apps/web-editor/src/features/generate-wizard/components/GenerateWizardPage.tsx` — top-level consumer — needs `useSearchParams` wiring.

  Test approach
  `apps/web-editor/src/features/generate-wizard/hooks/useGenerationDraft.hydrate.test.ts` (new, split per §9.7) — cover: (1) hydrate from existing draftId, (2) PUT-not-POST on first autosave, (3) fall-through on 404, (4) fresh-start when no draftId param.
  `apps/web-editor/src/features/generate-wizard/components/GenerateWizardPage.test.tsx` — extend with `?draftId=abc` memory-router case asserting initial render reflects the fetched promptDoc.

  Risk
  med — touches the core autosave state machine in `useGenerationDraft.ts`; must not regress the existing POST-then-PUT happy path or the debounce/flush timings.

  Dependencies None (BE `GET /generation-drafts/:id` already in place).
  Effort M

  ---

  Open Questions / Blockers
  - ⚠️ **Projects schema backfill strategy under IF NOT EXISTS.** `003_project_versions.sql` defines `projects` with `CREATE TABLE IF NOT EXISTS`, so migration 020 needs to be safe on both fresh (no rows) and seeded (dev user exists) DBs. Plan: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (MySQL 8.0.29+) or guard with `INFORMATION_SCHEMA` check. Confirm target MySQL version is 8.0.29+ before relying on `ADD COLUMN IF NOT EXISTS`.
  - ⚠️ **Thumbnail join pick order.** `findProjectsByUserId` must pick the first video or image clip deterministically. Spec: `ORDER BY start_frame ASC, clip_id ASC LIMIT 1`. Captions/audio clips are excluded (no visual thumbnail).
  - ⚠️ **Asset resolution in storyboard cards must be fault-tolerant.** Missing assets (user deleted media after draft referenced it) are silently skipped — never 500.
  - ⚠️ **Wizard hydrate branch must preserve debounce/flush timings.** The autosave state machine is non-trivial; add regression tests against `useGenerationDraft.timing.test.ts` to confirm no timing drift.
  - Stale design-guide screen ID: `docs/design-guide.md §6` lists Dashboard as `42945722fe52447f81e5be244f7cbb33`, but `mcp__stitch__list_screens` returns `a0801430836341b0ae811460bd9623bc` on 2026-04-17. Canonical is the live one. Design-guide update is out-of-scope for this epic — track separately.
  - `Storyboard List` screen (`b09435aa6f9a43ba8d172d21c95d353d`) is not yet documented in `docs/design-guide.md §6`. Add during or immediately after this epic lands — track separately.
  - `/editor?projectId=X` has no ACL check that the project belongs to the current user. Out-of-scope for this epic; flag as a follow-up security ticket.
  - Conceptual rename: user calls drafts "storyboards". FE uses "Storyboard" copy; DB table stays `generation_drafts` for now. Revisit if divergence becomes confusing.

  ---
  Notes for task-planner
  - Loaded memory entries: Code reviewer must report only, Escalate architecture/product decisions, Development workflow - Docker Compose, DEV_AUTH_BYPASS env, Design-reviewer approval for backend-only subtasks, Reviewer gate skipped for config-only subtasks.
  - Reuse audit highlights: `apps/api/src/repositories/project.repository.ts`, `apps/api/src/services/project.service.ts`, `apps/api/src/repositories/generationDraft.repository.ts` (list fn exists), `apps/web-editor/src/main.tsx` (router), `apps/web-editor/src/features/generate-wizard/hooks/useGenerationDraft.ts` (resume target), `apps/web-editor/src/features/asset-manager/components/AssetCard.tsx` (card pattern reference only).
  - Recommended build order: **Start with `[DB] 020 migration`** (unblocks the Projects list slice). Then land `[BE] Projects list slice` and, in parallel, `[BE] Storyboard cards endpoint` (independent). As soon as the API contract is stable, kick off `[FE] HomePage shell + routing`; the two panel tickets (`[FE] Projects panel`, `[FE] Storyboard panel`) can then run in parallel against the real endpoints. `[FE] Wizard resume-draft support` is independent and can slot in any time after the shell lands — ship last so it consumes the Storyboard card deep-link.

---

GUARDIAN FEEDBACK (Batch 2 of 2 Files-as-Root, 2026-04-19) — user verdict: **BOTH BLOCKING, fix in current phase**:

5. **[BLOCKING] Deterministic migration runner infrastructure.** The `INFORMATION_SCHEMA + PREPARE/EXECUTE` guards in migrations 015, 024, 025, 026 silently no-op under `docker-entrypoint-initdb.d` in some conditions — some migrations apply partially, others not at all, on the same container startup. This threatens the "snapshot-per-update + idempotent migrations" guarantee from `general_idea.md §9`. Replace the `docker-entrypoint-initdb.d` hook with a proper runner: create `schema_migrations` table (id, filename, applied_at, checksum); write `apps/api/src/db/migrate.ts` that walks `apps/api/src/db/migrations/*.sql`, checks `schema_migrations`, applies pending in a transaction, records checksum; call it on API boot before Express init. Add unit + integration tests (pending detection, checksum drift, transactional rollback). Must remove reliance on `docker volume rm` workaround.

6. **[BLOCKING] Apply pending migrations to live DB + drop legacy table.** On the current Docker DB, migrations 015 (widen `capability` ENUM to 8 values for ElevenLabs audio), 025 (drop `ai_generation_jobs.project_id`), and 026 (add `ai_generation_jobs.draft_id` + `output_file_id`) never applied. `aiGenerationJob.repository.ts:93-106, 149-190` already writes those columns — any live AI-generate call 500s. Also `project_assets_current` table still exists despite migration 024 step 12 dropping it — two sources of truth for reads. Use the new runner from item 5 to apply 015/025/026 to the live DB; add migration 027: `DROP TABLE IF EXISTS project_assets_current`; add integration test asserting final schema state; remove "wipe-volume workaround" notes from memory.

7. **[BLOCKING] Fix stale tests blocked by Batch 1 refactor.** `apps/api/src/__tests__/integration/migration-002.test.ts:86-92, 121-141` asserts dropped `caption_tracks.asset_id` column — update to `file_id` (5 failing tests). `apps/api/src/__tests__/integration/projects-list-endpoint.test.ts:161-162` and `apps/api/src/__tests__/integration/assets-delete-endpoint.test.ts:93-94` seed `project_clips_current (asset_id, ...)` — column renamed to `file_id` (20 tests blocked at beforeAll). After fix, full API suite must show only ~23 DEV_AUTH_BYPASS-class failures remaining; 14 schema-drift + 5 stale + 6 knock-on + 20 blocked must return to PASS.

---

DEFERRED (non-blocking, can batch later):

8. **Audit DEV_AUTH_BYPASS failure cluster.** 23 tests expect 401 but receive 2xx/409 because the `APP_DEV_AUTH_BYPASS` flag lets requests through. Pick one: (a) delete them (cannot run in dev-bypass mode), (b) gate them with `it.skipIf(process.env.APP_DEV_AUTH_BYPASS === 'true')`, or (c) build a harness that temporarily disables bypass for the auth-contract test block. Leaving them as "known failures" poisons every future guardian review.

9. **DTO rename `assetId` → `fileId` on the wire.** The on-disk model is `files` but API contracts still expose `assetId`. `apps/api/src/controllers/aiGeneration.controller.ts` has a Zod compat shim that silently strips `body.projectId` — every day it stays, risk grows that a consumer bakes it in. Rename the field across `packages/api-contracts/src/openapi.ts`, all controllers, all FE callers; remove the compat shim.

10. **Document new architectural decisions in `general_idea.md`.** Append an "Evolution since 2026-03-29" section covering: storyboard drafts (`generation_drafts` + card surface), files-as-root (user-scoped `files` root + `project_files`/`draft_files` pivots with CASCADE container / RESTRICT file), and the `features/` vs `shared/` split now that `ai-generation` moved to `shared/`. Future guardian reviews need an anchor that matches the codebase.

11. **Clean up working-tree noise.** 15 untracked `docs/test_screenshots/wizard-ai-*.png` and 2 deleted `playwright-screenshots/*.png` leftover from Subtask 7 sweep. Either add to `.gitignore` or commit/delete before next batch starts.