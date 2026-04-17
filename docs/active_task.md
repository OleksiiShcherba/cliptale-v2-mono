# Active Task

## Task
**Name:** EPIC — Home: Projects & Storyboard Hub
**Source:** `docs/general_tasks.md` (full epic with 7 tickets)
**Goal:** Replace `/editor` as the post-login landing page with a new `/` Home hub that lists the user's projects (Projects tab) and in-flight prompt-generation drafts (Storyboard tab), with create / resume / open deep-link flows.

---

## Context

### Why this task matters
Today, users land straight in `/editor` after login with no way to see or switch between projects, and no way to resume an in-flight generation draft. This epic ships the Dashboard + Storyboard hub that `docs/general_idea.md` and the Stitch design system treat as the canonical post-login surface. It's also a prerequisite for any future multi-project / multi-draft UX, so the data endpoints and routing shell here are load-bearing.

### Relevant architecture constraints
- Every new API route must use `authMiddleware` + `aclMiddleware('editor')` (`docs-claude/roadmap.md` §Agent Navigation Guide; `docs/architecture-rules.md`).
- Services must not touch `req`/`res` and must not read `process.env` — config lives in `apps/api/src/config.ts` only.
- All errors from services must be typed (`lib/errors.ts`) so the central handler can map them.
- Integration tests must hit a real MySQL — never mock the database.
- Every web-editor feature lives under `apps/web-editor/src/features/<name>/` with `components/`, `hooks/`, `api.ts`, `types.ts`; no cross-feature imports (architecture-rules §14).
- All HTTP calls from the web app go through `apiClient` — never raw `fetch`.
- DB schema changes: new numbered SQL file under `apps/api/src/db/migrations/`; must be idempotent (runs under `docker-entrypoint-initdb.d`).
- 300-line-per-file cap (§9.7) — split test files via `.fixtures.ts` + `.<topic>.test.ts` pattern when a file would exceed it.
- All dev testing runs through Docker Compose, not bare localhost (see `project_dev_workflow` memory).

### Related areas of the codebase
- `apps/api/src/db/migrations/` — next migration is `020_` (latest committed is `019_generation_drafts.sql`).
- `apps/api/src/repositories/project.repository.ts` — currently exposes only `createProject(projectId)` with no owner / title; extension point for the Projects slice.
- `apps/api/src/services/project.service.ts` — thin shell today (`createProject()`, no user arg); extension point.
- `apps/api/src/controllers/projects.controller.ts` + `routes/projects.routes.ts` — add `GET /projects`, update `POST /projects` body.
- `apps/api/src/services/generationDraft.service.ts` — `listMine` already exists; add `listStoryboardCardsForUser` alongside (do not replace).
- `apps/api/src/repositories/generationDraft.repository.ts` — add the ownership-filtered cards query.
- `apps/api/src/routes/generationDrafts.routes.ts` — already hosts `/generation-drafts` + `/:id/enhance` routes; add `GET /generation-drafts/cards` **before** the `/:id` pattern to avoid `cards` being parsed as an id.
- `packages/api-contracts/src/openapi.ts` — OpenAPI spec; register `GET /projects`, updated `POST /projects`, and `GET /generation-drafts/cards` + `StoryboardCardSummary` schema.
- `apps/web-editor/src/main.tsx` — router config; `/` currently missing, `*` falls back to `/editor`. Already modified on this branch to add a `/generate/road-map` placeholder (do NOT revert that change).
- `apps/web-editor/src/features/auth/components/LoginPage.tsx` — post-login `navigate('/editor')` target to change.
- `apps/web-editor/src/App.tsx` — existing two-column pattern (read-only reference, do not import).
- `apps/web-editor/src/features/generate-wizard/hooks/useGenerationDraft.ts` — autosave state machine; extension point for the hydrate branch (ticket 7).
- `apps/web-editor/src/features/generate-wizard/api.ts` — already has `createDraft`/`updateDraft`/`deleteDraft`/`startEnhance` helpers on the working tree; add `fetchDraft(id)` here without touching siblings.

### Reuse audit
- `apps/api/src/db/migrations/003_project_versions.sql` — defines current `projects` table with `CREATE TABLE IF NOT EXISTS` → extension point for the owner/title columns (do not re-create).
- `apps/api/src/db/migrations/011_seed_dev_user.sql` — source of the seed user id needed to backfill `owner_user_id` on existing rows.
- `apps/api/src/repositories/project.repository.ts` — already exports `createProject(projectId)`; widen signature to `(userId, title?)` and add `findProjectsByUserId`.
- `apps/api/src/services/project.service.ts` — thin shell; extension point for `listForUser` and the widened `createProject(userId, title?)`.
- `apps/api/src/services/generationDraft.service.ts` — `listMine` already returns raw drafts; **do not replace** — add `listStoryboardCardsForUser` alongside so future callers of the raw endpoint keep working.
- `apps/api/src/repositories/asset.repository.ts` — has `getAssetById`-style accessors for `thumbnail_url` + `asset_type`; reuse for storyboard media preview resolution. ⚠️ Do **not** reuse `services/aiGeneration.assetResolver.ts` — it is bound to the presigned-URL flow and is the wrong shape here.
- `apps/web-editor/src/features/generate-wizard/hooks/useGenerationDraft.ts` — core hook with POST-then-PUT autosave; extension point for the hydrate branch (ticket 7). Currently being touched by the in-progress AI Enhance work — coordinate: pull/rebase first, do not overwrite.
- `apps/web-editor/src/features/generate-wizard/api.ts` — already contains `createDraft`/`updateDraft`/`deleteDraft`/`startEnhance`/`getEnhanceStatus` on the working tree; add a new `fetchDraft(id)` helper alongside.
- `apps/web-editor/src/lib/api-client.ts` — has `buildAuthenticatedUrl` for auth-gated thumbnail URLs; reuse in both panels.
- `apps/web-editor/src/features/asset-manager/components/AssetCard.tsx` — read-only reference for card + hover pattern (do not cross-import per §14).
- `apps/web-editor/src/features/generate-wizard/components/AssetThumbCard.tsx` — read-only reference for thumb rendering pattern (do not cross-import).
- `apps/web-editor/src/shared/utils/formatTimecode.ts` — sibling directory for a new `formatRelativeDate.ts` helper if none exists yet.

---

## Subtasks

- [ ] **2. [BE] Projects list slice — repo + service + controller + route + OpenAPI**
  - What: Add `GET /projects` (list for the authenticated user) and widen `POST /projects` to accept an optional `title` and persist `owner_user_id`. Ship the full slice in one pass so the API contract has no loose ends.
  - Where: `apps/api/src/repositories/project.repository.ts` (add `findProjectsByUserId`; widen `createProject`), `apps/api/src/services/project.service.ts` (add `listForUser`; widen `createProject`), `apps/api/src/controllers/projects.controller.ts` (+ `listProjects` handler; update `createProject` to pass `req.user!.userId`), `apps/api/src/routes/projects.routes.ts` (register `GET /projects`), `packages/api-contracts/src/openapi.ts` (add `GET /projects` + update `POST /projects` body with optional `title`).
  - Why: Powers the Projects panel (subtask 5) and unblocks any future "my projects" UX.
  - Acceptance criteria:
    - `GET /projects` → `200 { items: ProjectSummary[] }` for the authenticated user, sorted by `updated_at DESC`; other users' rows are not visible.
    - `POST /projects` → accepts `{ title?: string }`, persists `owner_user_id = req.user.userId` and `title = body.title ?? 'Untitled project'`, returns `{ projectId }` with status 201.
    - `ProjectSummary.thumbnailUrl` is derived deterministically by joining `project_clips_current` → `project_assets_current`, picking the earliest visual clip (video or image) with `ORDER BY start_frame ASC, clip_id ASC LIMIT 1`; caption/audio clips excluded; returns `null` when no visual clip exists.
    - Unauthenticated → 401; authenticated-but-missing-editor-role → 403.
    - OpenAPI spec builds without type errors; both paths round-trip through `openapi.ts`.
    - Services accept `userId` as a parameter; no `req` inside services; no `config`/env reads.
    - Existing callers of `createProject()` (specifically `useProjectInit.ts`) continue to work without FE changes because `title` stays optional.
  - Test approach:
    - Extend `apps/api/src/services/project.service.test.ts` with happy-path `listForUser`, ownership isolation, and updated `createProject(userId, title)` coverage (Vitest, service-level, repo mocked).
    - Add `apps/api/src/repositories/project.repository.test.ts` (new) — unit tests with mocked `pool.query` covering the join, ORDER BY, and the widened signature.
    - Add `apps/api/src/__tests__/integration/projects-list-endpoint.test.ts` — real MySQL: seed 2 users × 2 projects with one `project_clips_current` row for one project; assert isolation + thumbnail derivation.
  - Risk: **med** — depends on subtask 1 landing first; changes the `createProject` service signature that `useProjectInit.ts` consumes (kept backward-compatible via optional arg).
  - Depends on: subtask 1.

- [ ] **3. [BE] Storyboard cards endpoint — GET /generation-drafts/cards**
  - What: Add `GET /generation-drafts/cards` returning per-draft card summaries: `{ draftId, status, textPreview, mediaPreviews: [{ assetId, type, thumbnailUrl }], updatedAt }`.
  - Where: `apps/api/src/services/generationDraft.service.ts` (add `listStoryboardCardsForUser`), `apps/api/src/repositories/generationDraft.repository.ts` (add ownership-filtered cards query — join or equivalent), `apps/api/src/controllers/generationDrafts.controller.ts` (add `listCards` handler), `apps/api/src/routes/generationDrafts.routes.ts` (register `GET /generation-drafts/cards` **before** the `/:id` route — Express matches in order), `packages/api-contracts/src/openapi.ts` (register path + `StoryboardCardSummary` schema).
  - Why: Powers the Storyboard panel (subtask 6). Keeps the raw `GET /generation-drafts` list endpoint untouched for future callers.
  - Acceptance criteria:
    - `GET /generation-drafts/cards` → `200 { items: StoryboardCardSummary[] }` sorted by `updated_at DESC`, scoped to the authenticated user.
    - Each item: `draftId`, `status ∈ {'draft','step2','step3','completed'}`, `textPreview ≤ 140 chars` (first N chars of concatenated `TextBlock` contents from `prompt_doc`), `mediaPreviews.length ≤ 3` (first 3 `MediaRefBlock`s resolved via `project_assets_current`), `updatedAt`.
    - Missing/deleted assets referenced by `MediaRefBlock`s are silently omitted from `mediaPreviews` — the endpoint **must not** throw 500 on a dangling reference.
    - Drafts owned by other users are not returned (SQL-level ownership filter).
    - Auth + ACL middleware applied identically to sibling draft routes.
    - Route ordering: `/generation-drafts/cards` is registered before `/:id` so Express resolves it correctly.
  - Test approach:
    - `apps/api/src/services/generationDraft.cards.service.test.ts` (new, sibling of existing `generationDraft.service.test.ts` per `.fixtures.ts` split pattern) — unit tests covering: text-preview truncation at 140 chars, media-preview cap at 3, missing-asset silent skip, status passthrough, ownership.
    - `apps/api/src/__tests__/integration/generation-drafts-cards-endpoint.test.ts` (new) — real MySQL: seed a user + draft with 5 media refs (expect 3 returned) + 1 reference to a deleted asset (expect skipped).
  - Risk: **med** — client-side iteration over media refs + ownership filter; easy to regress on the 140-char truncation or the missing-asset guard.
  - Depends on: none (independent of subtasks 1–2).

- [ ] **4. [FE] HomePage shell + routing + sidebar nav**
  - What: Add the `/` HomePage with a two-column layout (`HomeSidebar` on the left with Projects / Storyboard tabs, a main content region on the right), wire it into the router as a protected route, change the `*` fallback from `/editor` to `/`, and retarget post-login `navigate(...)` in `LoginPage`. Ship the shell only — no data yet.
  - Where: `apps/web-editor/src/features/home/` (new — `components/HomePage.tsx`, `components/HomeSidebar.tsx`, `types.ts`, `api.ts` stubs), `apps/web-editor/src/main.tsx` (add `/` route + change `*` fallback — **preserve** the existing `/generate/road-map` placeholder route that is already on the branch), `apps/web-editor/src/features/auth/components/LoginPage.tsx` (change post-login `navigate('/editor')` → `navigate('/')`).
  - Why: Blocks the Projects and Storyboard panel tickets; also gates the product-wide post-login redirect change.
  - Acceptance criteria:
    - New files live under `apps/web-editor/src/features/home/` per architecture rules §3.
    - `HomePage.tsx` renders the sidebar + a main region; active-tab state (local — no URL sync) drives which stub renders on the right.
    - Tab nav: `Projects` (active by default) and `Storyboard`; styles use tokens `surface-alt` background, `text-primary` text, `primary-light` active background (per `docs/design-guide.md §3`).
    - Router `/` is protected via `ProtectedRoute`; unauthenticated users hit `/login`.
    - Post-login navigates to `/` (verified manually in Docker Compose).
    - `*` fallback in `main.tsx` redirects to `/` (was `/editor`).
    - The unrelated `/generate/road-map` route added on the branch is left intact.
    - Visual tokens match Stitch `ClipTale Dashboard` (`a0801430836341b0ae811460bd9623bc`).
  - Test approach: `apps/web-editor/src/features/home/components/HomePage.test.tsx` (new) — mounts under `MemoryRouter`, asserts (1) both nav items render, (2) clicking `Storyboard` swaps the right-hand stub, (3) active-state class toggles. Extend `apps/web-editor/src/features/auth/components/LoginPage.test.tsx` to assert `navigate('/')` after successful login.
  - Risk: **low** — routing + static shell only, no API calls.
  - Depends on: none.

- [ ] **5. [FE] Projects panel — grid, card, create-project flow**
  - What: Implement the Projects tab — React Query hook that hits `GET /projects`, `ProjectCard` (thumbnail or placeholder + title + relative date + overflow-stub), `ProjectsPanel` (header + Create CTA + responsive grid + empty / loading / error states). Create CTA POSTs to `/projects` and navigates to the new editor URL. Card click navigates to the existing editor URL.
  - Where: `apps/web-editor/src/features/home/` (extends subtask 4) — add `hooks/useProjects.ts`, `components/ProjectCard.tsx`, `components/ProjectsPanel.tsx`, `api.ts` (real `listProjects`, `createProject`), `types.ts` (add `ProjectSummary`). If missing: add `apps/web-editor/src/shared/utils/formatRelativeDate.ts` as a sibling of `formatTimecode.ts`.
  - Why: Main content for the Projects tab; replaces the old "dropped into /editor with no context" UX.
  - Acceptance criteria:
    - `useProjects()` returns `{ data, isLoading, isError }` keyed `['home', 'projects']`; loading renders 6 skeleton placeholders; error renders the shared error-state component.
    - Empty state: "No projects yet" copy + same primary `Create New Project` CTA centered, no grid rendered.
    - `ProjectCard` renders title, relative date (e.g. "2 hours ago"), and either the thumbnail image or a placeholder SVG when `thumbnailUrl` is `null` — never a broken image icon.
    - Create flow: button disabled while the mutation is in flight; on success navigates to `/editor?projectId=<new>`; on failure shows inline error text.
    - Card click → `navigate('/editor?projectId=' + projectId)` with no full page reload.
    - Responsive grid: ≥1440px = 3-col, 768–1439px = 2-col, <768px = 1-col; gaps use `space-6` (24px).
    - All HTTP goes through `apiClient` — no raw `fetch`.
  - Test approach:
    - `apps/web-editor/src/features/home/components/ProjectsPanel.test.tsx` — loading / empty / error / populated renders; click-create invokes `apiClient.post('/projects', ...)` and navigates.
    - `apps/web-editor/src/features/home/components/ProjectCard.test.tsx` — thumbnail fallback + relative date + click-to-navigate.
    - `apps/web-editor/src/features/home/hooks/useProjects.test.ts` — query-key stability + error surfacing.
  - Risk: **low** — new feature, no shared state dependencies.
  - Depends on: subtasks 2 and 4.

- [ ] **6. [FE] Storyboard panel — card list, create-storyboard, resume**
  - What: Implement the Storyboard tab — React Query hook against `GET /generation-drafts/cards`, `StoryboardCard` (status badge + truncated text + media-preview row + Resume), `StoryboardPanel` (header + Create CTA + responsive grid + empty / loading / error states). Create CTA navigates to `/generate`; Resume / card click navigates to `/generate?draftId=<id>`.
  - Where: `apps/web-editor/src/features/home/` (extends subtask 4) — add `hooks/useStoryboardCards.ts`, `components/StoryboardCard.tsx`, `components/StoryboardPanel.tsx`, extend `api.ts`, extend `types.ts` (`StoryboardCardSummary`).
  - Why: Main content for the Storyboard tab; enables resume of in-flight prompt drafts from a single surface.
  - Acceptance criteria:
    - `useStoryboardCards()` returns `{ data, isLoading, isError }` keyed `['home', 'storyboards']`; loading renders 3 skeleton placeholders.
    - Empty state: "No storyboards yet" + `Create Storyboard` CTA.
    - `StoryboardCard`: status badge color map — `warning` for `step2` / `step3`, `success` for `completed`, `text-secondary` for `draft`; text preview truncates at 140 chars with `-webkit-line-clamp: 2`; each media-preview thumb is 56×56 with `radius-sm` and `object-fit: cover`; placeholder SVG when `thumbnailUrl` is `null`.
    - `Create Storyboard` button navigates to `/generate` (no draft exists yet — wizard creates one on first edit, per existing behavior).
    - Card click / Resume → `navigate('/generate?draftId=' + draftId)` (consumed by subtask 7).
    - Responsive behavior mirrors Projects panel (3 / 2 / 1 col).
    - All HTTP goes through `apiClient`.
  - Test approach:
    - `apps/web-editor/src/features/home/components/StoryboardPanel.test.tsx` — loading / empty / error / populated renders; Create button navigates; card click navigates with `draftId` query param.
    - `apps/web-editor/src/features/home/components/StoryboardCard.test.tsx` — status badge color mapping; media-preview cap at 3; placeholder SVG on null thumbnail.
    - `apps/web-editor/src/features/home/hooks/useStoryboardCards.test.ts` — query-key stability + error surfacing.
  - Risk: **low** — new feature on top of an already-specified endpoint.
  - Depends on: subtasks 3 and 4.

- [ ] **7. [FE] Wizard resume-draft support (?draftId=<id>)**
  - What: Extend `GenerateWizardPage` + `useGenerationDraft` so that when the URL contains `?draftId=<id>`, the wizard fetches the existing draft via `GET /generation-drafts/:id` instead of starting a fresh create flow, hydrates editor state from `draft.promptDoc`, and PUTs subsequent autosaves against the existing id. Fall back to fresh-start on 404 / 403.
  - Where: `apps/web-editor/src/features/generate-wizard/hooks/useGenerationDraft.ts` (add hydrate branch), `apps/web-editor/src/features/generate-wizard/api.ts` (add `fetchDraft(id)` helper alongside existing `createDraft` / `updateDraft` / `deleteDraft` / `startEnhance` / `getEnhanceStatus`), `apps/web-editor/src/features/generate-wizard/components/GenerateWizardPage.tsx` (wire `useSearchParams` and the hydrate branch). ⚠️ This file is currently in a mid-refactor state on the working tree (in-progress AI Enhance work). Pull the latest, do not revert any of the `startEnhance` / `getEnhanceStatus` helpers or the `/generate/road-map` route.
  - Why: Makes the Storyboard panel's "Resume" deep-link useful; closes the loop of the epic end-to-end.
  - Acceptance criteria:
    - `/generate?draftId=<existing-id>` renders the editor pre-populated with `draft.promptDoc` (text + media chips).
    - Subsequent autosaves PUT to `/generation-drafts/<existing-id>` — no new draft row is created.
    - `/generate` (no query param) behaves exactly as today: creates a new draft on the first edit.
    - Fetch failure (404 / 403) logs at `console.warn` and falls through transparently to the fresh-start flow; no crash, no blank screen.
    - Cancel + Next actions continue to work against the hydrated draft id.
    - No new endpoints introduced; only `api.ts` gains `fetchDraft(id)`.
    - Debounce and flush timings in the autosave state machine are unchanged (verified by the existing timing test or a new regression case).
    - No regression in the in-progress AI Enhance flow (startEnhance / getEnhanceStatus / `/generate/road-map` placeholder).
  - Test approach:
    - `apps/web-editor/src/features/generate-wizard/hooks/useGenerationDraft.hydrate.test.ts` (new, split per §9.7) covering: (1) hydrate from existing draftId, (2) PUT-not-POST on first autosave after hydrate, (3) fall-through on 404, (4) fresh-start when no draftId param.
    - Extend `apps/web-editor/src/features/generate-wizard/components/GenerateWizardPage.test.tsx` with a `?draftId=abc` MemoryRouter case asserting initial render reflects the fetched `promptDoc`.
    - If no `useGenerationDraft.timing.test.ts` exists, add a minimal regression case proving debounce interval is still `~2s`.
  - Risk: **med** — touches the autosave state machine (non-trivial) and shares files with the in-progress Enhance work; must not regress POST-then-PUT timings or the Enhance endpoints.
  - Depends on: none (BE `GET /generation-drafts/:id` already exists — verified on the current tree at `apps/api/src/routes/generationDrafts.routes.ts` lines 32–37).

---

## Open Questions / Blockers

- **None block the plan.** The four `⚠️` items from `docs/general_tasks.md` are all resolved inline in the subtask acceptance criteria:
  1. Projects migration idempotency → subtask 1 uses `ADD COLUMN IF NOT EXISTS` (MySQL 8.0.29+).
  2. Thumbnail deterministic pick → subtask 2 specifies `ORDER BY start_frame ASC, clip_id ASC LIMIT 1`, visual clips only.
  3. Dangling asset refs on storyboard cards → subtask 3 requires silent skip, no 500.
  4. Wizard hydrate preserves debounce → subtask 7 acceptance criteria explicitly gates on timing regression test.
- **Coordinate with in-progress AI Enhance work.** The branch has ~500 lines of uncommitted changes adding POST/GET `/generation-drafts/:id/enhance`, `enhance.rate-limiter.ts`, `enqueue-enhance-prompt.ts`, the `/generate/road-map` placeholder route, and major edits to `GenerateWizardPage.tsx` / `generate-wizard/api.ts`. These do **not** conflict with this epic semantically, but they touch the same files subtasks 3 and 7 will edit. Implementing agent must pull the latest state before editing and must not revert Enhance artifacts.
- **Out-of-scope follow-ups (flagged for later, do not address here):**
  - `docs/design-guide.md §6` still lists a stale Dashboard screen id (`42945722fe52447f81e5be244f7cbb33`); live is `a0801430836341b0ae811460bd9623bc` as of 2026-04-17. Track separately.
  - Storyboard List screen (`b09435aa6f9a43ba8d172d21c95d353d`) not yet documented in design-guide §6. Track separately.
  - `/editor?projectId=X` has no ACL check that the project belongs to the current user. Separate security ticket.

---

## Notes for the implementing agent

- **Navigation mode used during planning:** ROADMAP — read `docs-claude/roadmap.md`, then verified specific files (`project.repository.ts`, `project.service.ts`, `generationDrafts.routes.ts`, `migrations/` listing) directly.
- **Domain skills loaded during planning:** `/task-design-sync` is relevant for subtasks 4–6 (FE, Stitch-designed screens — `a0801430836341b0ae811460bd9623bc` Dashboard and `b09435aa6f9a43ba8d172d21c95d353d` Storyboard List). The implementing agent should invoke `/task-design-sync` **before** starting subtask 4 to pull the latest Figma/Stitch tokens for those two screens into the subtask context. Remotion, Anthropic SDK, and Playwright skills were **not** loaded — none of the subtasks touch those areas.
- **Relevant memory entries (cite by title, do not duplicate):**
  - `Development workflow - Docker Compose` → run all tests and manual verification through `docker compose up`, not bare localhost.
  - `Escalate architecture/product decisions to user` → if a subtask surfaces a decision beyond what's in the AC, stop and ask.
  - `DEV_AUTH_BYPASS environment variable enum handling` → if you need auth to pass in dev, use `APP_DEV_AUTH_BYPASS='true'` (string enum).
  - `Design-reviewer approval for backend-only subtasks` → subtasks 1, 2, 3 are backend-only (no UI surface); design review is auto-APPROVED.
  - `Code reviewer must report only, never fix` → when invoking `code-quality-expert`, act on its report yourself.
- **Build order (authoritative):** 1 → 2 (must land together because the `createProject` signature changes and `useProjectInit.ts` consumes it). 3 can land in parallel with the 1+2 pair. 4 can land as soon as 1+2 or 3 are merged (no FE blocker on either). 5 requires 2+4. 6 requires 3+4. 7 is independent and can slot in any time after 4, but ships last so it consumes the Storyboard panel's `?draftId=` deep-link.
- **File-size cap (§9.7):** If any file you're extending would exceed 300 lines, split the test file via `.fixtures.ts` + `.<topic>.test.ts` before adding new cases. `apps/web-editor/src/features/generate-wizard/api.ts` and `GenerateWizardPage.tsx` are already close — subtask 7 explicitly splits the hydrate test into its own file.
- **Design source of truth:** Stitch screens referenced above are canonical. `docs/design-guide.md §6` is partially stale (flagged above) — prefer live Stitch IDs via the stitch MCP when they conflict.
- **Do not revert in-progress work.** The git working tree has uncommitted changes for the AI Enhance feature (see Open Questions). Coordinate via rebase / stash as needed; never overwrite.

---
_Generated by task-planner skill — 2026-04-17_

---
**Status: Ready For Use By task-executor**
