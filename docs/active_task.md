# Active Task

## Task
**Name:** Files-as-root foundation (BATCH 2 of 2) — FE upload + AI port to wizard + regression
**Source:** `docs/general_tasks.md` (FEEDBACK lines 254–259) — continuation of `active_task.md` (BATCH 1)
**Goal:** Port the editor's upload + AI generation flows to the storyboard (wizard) page by (a) extracting `useAssetUpload` into a shared, context-aware `useFileUpload` hook, (b) extracting AI generation components into `shared/ai-generation/` per §14, (c) refactoring `AiGenerationPanel` to accept a `{ kind: 'project' | 'draft', id }` context prop, (d) adding a `POST /generation-drafts/:draftId/ai/generate` endpoint that links the output file to the draft, (e) wiring both upload + AI tabs into the wizard's `MediaGalleryPanel`, and (f) running a Playwright regression sweep.

---

## Context

### Why this task matters
Batch 1 landed the `files` root table, pivot tables (`project_files`, `draft_files`), link endpoints, and the AI-job refactor (job tied to `user_id` + `output_file_id`, no `project_id`). The backend is now shape-ready for drafts to own files the same way projects do. The remaining work is the frontend port plus one small backend addition (draft-scoped AI generation endpoint). Feedback items #3 (general upload flow usable from storyboard) and #4 (AI generation available on storyboard pages) become unblocked only after this batch. Because the editor's AI panel is wired to `projectId` as a hard dependency, we must generalize that plumbing before the wizard can reuse it — otherwise each feature would fork its own panel, violating §14 (no cross-feature imports) and doubling maintenance cost.

### Relevant architecture constraints
- **§14 No cross-feature imports.** The wizard (`features/generate-wizard`) cannot import from `features/ai-generation` or `features/asset-manager`. Shared code goes into `shared/` (preferred for pure UI/hooks) or `store/` (for cross-feature state).
- **§9.7 300-line file cap.** `AiGenerationPanel.tsx` is already a large orchestrator — extracting sub-components to `shared/` must not push any file over 300 lines. Pre-split via `*.fixtures.ts` + `.<topic>.test.ts` where needed.
- **§2 4-layer API.** The new draft AI endpoint follows `routes → controller → service → repository`. Service delegates to the existing AI generation service (no duplication); controller is thin; route lives in `apps/api/src/routes/generationDrafts.routes.ts` (already exists).
- **Invariant: only `config.ts` reads `process.env`.** No change here — existing config is reused.
- **Integration tests hit real MySQL.** New `/generation-drafts/:draftId/ai/generate` endpoint test goes in `generationDraft.service.test.ts` or a sibling `generationDraft.aiGeneration.test.ts` split if the main test file is near the 300-line cap.
- **Dev workflow via Docker Compose only.** Playwright regression runs against the dockerized stack.
- **Only `db/connection.ts` creates the pool; only repositories import it.** Draft AI endpoint does not need a new repository — it delegates to existing `aiGeneration.service` + a pivot insert via `fileLinks.repository` (from Batch 1 Subtask 5).

### Related areas of the codebase
- `apps/web-editor/src/features/asset-manager/hooks/useAssetUpload.ts` — current upload hook keyed by `projectId`; extract into shared.
- `apps/web-editor/src/features/asset-manager/api.ts` (`requestUploadUrl`, `finalizeAsset`) — current upload API client; after Batch 1 the backend routes are `POST /files/upload-url` + `POST /files/:id/finalize` + pivot link calls. FE api client must be ported too (new `shared/file-upload/api.ts` or keep in `features/asset-manager/api.ts` as a thin re-export).
- `apps/web-editor/src/features/ai-generation/components/AiGenerationPanel.tsx` — line 27: `projectId: string` prop; the whole component + sub-components (`GenerationOptionsForm`, `CapabilityTabs`, `ModelCard`, `AssetPickerField`, `VoicePickerField`, `VoicePickerModal`, `SchemaFieldInput`, `GenerationProgress`) need to move into `shared/ai-generation/`.
- `apps/web-editor/src/features/ai-generation/hooks/useAiGeneration.ts` — line 11: `submit(projectId, request)`; signature generalizes to `submit(context, request)` where `context = { kind: 'project' | 'draft', id }`.
- `apps/web-editor/src/features/ai-generation/api.ts` — `submitGeneration(projectId, request)`; API client signature must accept context and POST to the right endpoint (`/projects/:id/ai/generate` vs `/generation-drafts/:id/ai/generate`).
- `apps/web-editor/src/features/ai-generation/components/AssetPickerField.tsx` — currently loads project-scoped assets; must become context-aware (project: `GET /projects/:id/assets`, draft: `GET /generation-drafts/:id/assets` — the latter landed in Batch 1 Subtask 5).
- `apps/web-editor/src/features/generate-wizard/components/MediaGalleryPanel.tsx` — entry point where the upload CTA + AI tab get wired in. Already has a tab bar (`MediaGalleryTabs`) — AI is a new tab value.
- `apps/api/src/routes/generationDrafts.routes.ts` — extend with `POST /:draftId/ai/generate`.
- `apps/api/src/controllers/generationDrafts.controller.ts` — new thin handler.
- `apps/api/src/services/generationDraft.service.ts` — new orchestration method that delegates to `aiGeneration.service.submit(userId, request)` and then calls `fileLinks.service.linkFileToDraft(draftId, outputFileId)` after job completion (via worker callback or on-read resolution).
- `apps/web-editor/src/shared/hooks/` + `apps/web-editor/src/shared/utils/` — convention established; add `shared/file-upload/` + `shared/ai-generation/` alongside.
- `docs/development_logs.md` — Playwright regression results get appended as NOT → YES for workflows covered in Subtask 7.

### Reuse audit
- `apps/web-editor/src/features/asset-manager/hooks/useAssetUpload.ts` — **move + generalize** into `shared/file-upload/useFileUpload.ts`. Preserve the XHR wrapper (`uploadViaXhr`) verbatim — do not rewrite the upload transport. Adapter layer at the top of the hook switches between project-link and draft-link after finalize.
- `apps/web-editor/src/features/asset-manager/components/UploadDropzone.tsx` (if present) — **check for it in Subtask 2**; if present, extract to `shared/file-upload/UploadDropzone.tsx`; if not, the wizard uses a new minimal dropzone inline and we skip extraction.
- `apps/web-editor/src/features/ai-generation/components/AiGenerationPanel.tsx` + all siblings — **move wholesale** into `shared/ai-generation/`. Do not fork.
- `apps/web-editor/src/features/ai-generation/hooks/*` — **move**.
- `apps/web-editor/src/features/ai-generation/api.ts` + `types.ts` — **move** to `shared/ai-generation/api.ts` + `types.ts`.
- `apps/api/src/services/aiGeneration.service.ts` — **reuse directly**; the draft endpoint delegates to the existing submit path. Do not duplicate job creation logic.
- `apps/api/src/services/fileLinks.service.ts` (from Batch 1 Subtask 5) — **reuse directly** to link the AI output file to the draft after completion.
- `apps/api/src/repositories/generationDraft.repository.ts` — **extend** only if the draft AI endpoint needs a new read; otherwise no change.
- `apps/web-editor/src/features/generate-wizard/components/MediaGalleryPanel.tsx` — **extend in place**. Add upload affordance + AI tab. Keep file ≤ 300 lines (currently has helper sub-components — consider moving them to fixtures file if cap is approached).

---

## Subtasks

- [ ] **7. [Playwright] E2E regression sweep**
  - What: Run the playwright-reviewer workflow against a fresh Docker Compose stack, covering: Home Hub scroll + Create Storyboard (Batch 1 Subtask 1), editor upload (regression after shared hook extract), wizard upload (new in Subtask 2), editor AI generation (regression after shared-move + context-prop refactor), wizard AI generation (new in Subtask 6). Update `docs/development_logs.md` entries from NOT → YES for every workflow that passes, and flag any that fail with screenshots.
  - Where:
    - `apps/web-editor/docs/test_screenshots/` (new screenshots from the run)
    - `docs/development_logs.md` (status updates)
    - Playwright scripts live where the existing playwright-reviewer agent expects them.
  - Why: This is the final gate. Both batches touched shared surfaces (upload hook, AI panel, pivot reads) — regression risk is real and only E2E catches integration bugs.
  - Acceptance criteria:
    - All 5 workflows above execute without exceptions.
    - `development_logs.md` entries updated from NOT → YES (or flagged with root cause if they fail).
    - No unexpected console errors in the Playwright run beyond known-acceptable warnings.
  - Test approach:
    - Delegate to the `playwright-reviewer` agent.
  - Risk: **low** — this is a verification subtask, not an implementation one. Any failure discovered here is a bug in an earlier subtask and must be fixed there, not worked around here.
  - Depends on: Subtasks 1–6.

---

## Open Questions / Blockers

- **⚠️ Worker completion hook shape (Subtask 5).** Depends on how Batch 1 Subtask 8 structured the worker's post-success path. Two viable designs: (a) the worker emits a generic "job complete" event that both project and draft completion listeners subscribe to, or (b) the service takes a callback at job submission that runs after completion. **Confirm the shape before starting Subtask 5** — if Batch 1 didn't leave a seam, a small refactor is needed and the subtask estimate grows.
- **⚠️ `UploadDropzone` extraction (Subtask 2).** Depends on whether the editor already has a reusable dropzone component. If yes, extract it; if no, the wizard gets a minimal inline implementation and we ship without a shared dropzone. **Decide during Subtask 2 — no blocker before start.**
- **⚠️ DTO naming carry-over from Batch 1 Open Question.** Batch 1 kept `assetId` in the wire DTO for compatibility. Subtask 1 here introduces new link endpoints that use `fileId`. That's fine in isolation (new endpoints can use the new name), but we end up with a split vocabulary (`assetId` in clip/caption DTOs, `fileId` in link DTOs). If the user wants consistency, flip clip/caption DTOs to `fileId` in this batch. **Decision needed before Subtask 1 merges.**

---

## Notes for the implementing agent

- **Navigation mode used during planning: ROADMAP.** `docs-claude/` roadmaps were the primary maps. Targeted Glob/Read confirmed exact file lists for `ai-generation/` (14 components, 4 hooks), `asset-manager/hooks/`, `shared/`, and `MediaGalleryPanel`.
- **Relevant memory entries (cite by title from `MEMORY.md`):**
  - *Development workflow - Docker Compose* — Subtask 7 runs against the dockerized stack, never bare localhost.
  - *Design-reviewer approval for backend-only subtasks* — Subtask 5 is backend-only → design review auto-closes YES.
  - *Code reviewer must report only, never fix* — enforce during the review gate.
  - *Escalate architecture/product decisions to user* — honored via the three Open Questions above.
  - *Phase 2 ElevenLabs architecture decisions* — audio generation uses ElevenLabs; when Subtask 4's AssetPickerField handles audio reference uploads, the same draft-scoped `audio_upload` field flow applies.
- **Domain skills loaded during planning:** `/playwright-reviewer` (Subtask 7). No Remotion, no Anthropic SDK, no Figma-driven design work in this batch.
- **Build order inside Batch 2:** Subtasks can pipeline. Order-of-least-friction: **3 first** (pure move, unblocks everything else); **1 in parallel** (upload hook extract, independent of ai-generation move); **4 after 3** (AI panel refactor); **5 after Batch 1 verification** (backend endpoint) — can run in parallel with FE subtasks; **2 after 1** (wizard upload wiring); **6 after 4 + 5** (wizard AI tab); **7 last** (regression gate).
- **Do not refactor logic during the pure moves.** Subtask 3 is import-path-only; Subtask 1's only behavioural change is the new context target. Mixing move + refactor in one subtask makes the diff unreviewable.
- **Verify Batch 1 is fully merged before starting Batch 2.** Subtasks 1, 2, 4, 5, 6 all depend on Batch 1 endpoints (`POST /files/upload-url`, `POST /files/:id/finalize`, `POST /projects/:id/files`, `POST /generation-drafts/:id/files`, `GET /generation-drafts/:id/assets`, `POST /projects/:id/ai/generate` with the refactored shape). If any are missing, stop and flag.
- **Every new source file must stay ≤ 300 lines.** Pre-empt with `*.fixtures.ts` + `.<topic>.test.ts` splits from the start rather than refactoring later.

---
_Generated by task-planner skill — 2026-04-18_

---
**Status: Ready For Use By task-executor**
