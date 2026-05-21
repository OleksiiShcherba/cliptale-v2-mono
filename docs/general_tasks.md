Issues:

1. Edit Scene modal — зміни до щойно доданого блоку (промт, зображення) не зберігаються при натисканні Save. Також блок не відображає щойно введений промт чи додане зображення.
2. Storyboard при відкритті не підтягує останні зміни з історії — canvas порожній замість того, щоб показати збережений стан.

General Plan — Storyboard Flow:

Goal:
Make the storyboard flow usable end-to-end:
Step 1 — user enters a prompt and adds media.
Step 2 — OpenAI analyzes the prompt/media and produces a structured scene plan; the system creates connected storyboard scene blocks with prompts and generated scene illustrations.
Step 3 — the system creates a project from storyboard scenes, generates video assets from scenes, and assembles the final Remotion composition.

Current system pieces already available:

1. Step 1 draft prompt/media persistence exists via `generation_drafts.prompt_doc`.
2. Draft media linking exists via `draft_files`.
3. Storyboard blocks, media items, edges, autosave, and history exist.
4. AI generation jobs exist through the draft/project AI generation pipeline.
5. Project versions and Remotion render pipeline exist.
6. `/generate/road-map` is currently only a placeholder and should become the real Step 3 entry point.

Required work:

1. Stabilize existing Storyboard behavior before building automation.
   - Fix Edit Scene modal so prompt/media changes persist and immediately update the block UI.
   - Fix Storyboard load/restore so the canvas shows the last saved state instead of opening empty.
   - Verify add/edit/delete/connect/restore with unit tests and E2E coverage.

2. Extend Step 1 draft data.
   - Add selected video length to the draft model.
   - Add aspect ratio/render preset if needed for scene planning and final project creation.
   - Add optional style/model preferences for storyboard generation.
   - Update shared schema, API validation, FE state, and autosave.

3. Add AI storyboard planning.
   - Add backend endpoint/job, e.g. `POST /generation-drafts/:id/storyboard-plan`.
   - Treat planning as an async operation: POST returns a queued job quickly, and a polling endpoint exposes queued/running/completed/failed states so the frontend can show a loader between Step 1 and Step 2.
   - Resolve prompt media refs into useful context: metadata, thumbnails/keyframes, transcripts where available, and signed URLs where needed.
   - Normalize media by capability before calling OpenAI: images can be vision inputs, audio should be transcript-first plus metadata, and video should use metadata + thumbnails/keyframes + transcript rather than assuming raw full-video understanding.
   - Call OpenAI with compact multimodal context.
   - Return and persist a structured instruction array with scene number, prompt, visual prompt, duration seconds, referenced media, transition notes, and style.
   - Derive scene count from selected video length.

4. Create storyboard scenes from the AI plan.
   - Add bulk creation service for scene blocks from the plan.
   - Create scene blocks with `name`, `prompt`, `duration_s`, `sort_order`, `style`, and media refs.
   - Auto-connect graph as `START -> scene 1 -> scene 2 -> ... -> END`.
   - Push a storyboard history snapshot after generation.
   - Surface progress/errors in the Step 2 UI, consuming the async storyboard-plan job states from Block 3.

5. Generate scene illustrations.
   - For each scene block, enqueue an AI image generation job using the scene visual prompt.
   - When the job completes, link the generated output file to the storyboard block media.
   - Add per-scene generation status so the UI can show queued/running/failed/ready.
   - Keep generated images linked to the draft so they appear in the storyboard/media gallery.

6. Implement Step 3 project creation from storyboard.
   - Replace the `/generate/road-map` placeholder with a real Step 3 screen.
   - Add backend service/endpoint to create a project from a storyboard draft.
   - Read scene blocks in graph order from START to END.
   - Create a new project and build a valid `ProjectDoc`.
   - Add tracks and sequential clips based on scene duration.
   - Use generated scene images as image clips initially.
   - Persist the first project version and link all used files to the project.
   - Navigate to `/editor?projectId=<id>` after successful creation.

7. Generate final video composition.
   - Decide whether Step 3 creates only image-based scene clips first or also triggers image-to-video generation per scene.
   - If generating video per scene, enqueue AI video jobs per scene and replace image clips with video clips when ready.
   - Use existing Remotion render pipeline for final export.
   - Add user-visible status for project assembly and render readiness.

8. Testing and validation.
   - Unit test schema changes, plan parsing, scene-count calculation, graph generation, and ProjectDoc conversion.
   - Integration test storyboard-plan endpoint, bulk scene creation, image generation linkage, and project creation.
   - E2E test full flow: prompt + media -> generate storyboard -> generated scene blocks -> create project -> preview/render-ready editor.

---

Epic — Consistent Storyboard Illustration Style Reference Pipeline:

Goal:
Replace independent per-scene text-to-image generation with a reference-driven image generation flow so all storyboard scene images share one visual style, character language, lighting, and composition rules.

Product behavior:

1. If the user attaches one or more visual references in Step 1, the system first generates one canonical storyboard style reference image from those user images plus the draft prompt/style settings.
2. If the user attaches no visual references, the system first generates one canonical storyboard style reference image from the draft text prompt/style settings using text-to-image.
3. Scene images are then generated sequentially from that canonical reference using image-edit/image-to-image plus the individual scene visual prompt.
4. Each later scene should also be allowed to use the previous generated scene image as an additional reference, but the canonical reference must remain the style anchor for the whole sequence.
5. The canonical reference image must be stored as a draft file, visible in status/debug surfaces, and reusable when retrying failed scene illustrations.

Backend tickets:

1. Add storyboard illustration reference data model.
   - Goal: persist a draft-level illustration reference job and output file separately from per-scene jobs.
   - Scope: add table or extend existing storyboard illustration mapping model with reference job type, canonical output file id, source reference file ids, status, error message, created/updated timestamps.
   - Acceptance criteria: one active canonical reference per draft; failed references can be retried; deleting a draft cleans up mappings; existing per-scene jobs remain compatible.
   - Likely files: `apps/api/src/db/migrations/*`, `apps/api/src/repositories/storyboardSceneIllustration.repository.ts` or a new reference repository, migration tests.
   - Dependencies: existing `ai_generation_jobs`, `draft_files`, `files`.
   - Validation: migration tests, repository tests, active-lock/idempotency tests.

2. Implement reference selection and canonical reference generation.
   - Goal: decide whether to generate the canonical reference from user visual refs or from text only.
   - Scope: read draft prompt_doc media refs and linked draft files; filter to visual image references; if none, enqueue text-to-image; if present, enqueue image_edit with all reference image ids plus a synthesis prompt.
   - Acceptance criteria: text-only drafts create one generated reference; image-ref drafts create one generated merged reference; non-image refs are ignored for image reference generation; output file is linked to the draft.
   - Likely files: `apps/api/src/services/storyboardIllustration.service.ts`, `apps/api/src/services/aiGeneration.service.ts`, `apps/api/src/services/aiGeneration.assetResolver.ts`, `packages/api-contracts/src/fal-models.ts`.
   - Dependencies: supported image_edit model with `image_urls`; asset resolver already supports image URL lists.
   - Validation: service tests for no refs, one ref, multiple refs, missing/deleted refs, and enqueue failure.

3. Change per-scene illustration generation to reference-driven sequential jobs.
   - Goal: generate scene images with a consistent style anchor instead of standalone text-to-image.
   - Scope: require or create canonical reference before scene jobs; generate scenes in storyboard order; use image_edit/image-to-image options with canonical reference and optionally previous scene output.
   - Acceptance criteria: scene 1 uses canonical reference; scene N uses canonical reference plus scene N-1 output when available; retries use the same canonical reference; failed scene does not block retrying only that scene; no duplicate active jobs per block.
   - Likely files: `apps/api/src/services/storyboardIllustration.service.ts`, `apps/api/src/repositories/storyboardSceneIllustration.repository.ts`, `apps/media-worker/src/jobs/ai-generate.job.ts`.
   - Dependencies: canonical reference ticket, current scene illustration mapping/attach flow.
   - Validation: unit tests for option builder and ordering; integration tests for all-scene start and block retry behavior.

4. Extend status API for reference lifecycle.
   - Goal: let UI distinguish “creating style reference” from “creating scene illustrations.”
   - Scope: update `GET/POST /storyboards/:draftId/illustrations` responses to include reference status/output and scene status list.
   - Acceptance criteria: status exposes reference queued/running/ready/failed, reference output file id, scene job statuses, and user-friendly failed reasons; OpenAPI matches implementation.
   - Likely files: `packages/api-contracts/src/openapi.ts`, `apps/api/src/controllers/storyboardIllustration.controller.ts`, `apps/api/src/services/storyboardIllustration.service.ts`, `apps/web-editor/src/features/storyboard/types.ts`.
   - Dependencies: backend reference model.
   - Validation: OpenAPI tests, endpoint integration tests, frontend API tests.

Frontend tickets:

1. Update Step 2 illustration controls and status copy.
   - Goal: communicate the two-phase flow without exposing provider details.
   - Scope: show “Creating visual style reference” before scene generation; show the canonical reference thumbnail when ready; keep Step 3 blocked until reference and scene images are ready or failures are handled.
   - Acceptance criteria: user sees clear queued/running/failed/ready states; failed reference can be retried; failed scene can still be retried per block; Back/Home remain available.
   - Likely files: `apps/web-editor/src/features/storyboard/hooks/useStoryboardIllustrations.ts`, `StoryboardPlanControls.tsx`, `SceneBlockNode.tsx`, styles/tests.
   - Dependencies: extended status API.
   - Validation: hook tests, component tests, focused UI tests.

2. Surface canonical reference in storyboard/debug UI.
   - Goal: make it obvious what style image anchors the sequence.
   - Scope: add a compact reference preview near illustration controls or in storyboard sidebar; use authenticated asset stream/thumbnail handling.
   - Acceptance criteria: reference preview appears when ready; text-only drafts still show generated reference; image-ref drafts show generated merged reference; broken image URLs fall back gracefully.
   - Likely files: storyboard components/styles, asset URL helpers.
   - Dependencies: reference output file id in status API.
   - Validation: component tests for preview and fallback.

Tests and validation tickets:

1. Add E2E coverage for consistent-reference flow.
   - Goal: verify the user journey from draft refs to canonical reference to sequential scene images.
   - Scope: mock API/worker statuses and authenticated asset streams; assert reference phase, scene phase, retry behavior, and final block thumbnails.
   - Acceptance criteria: one E2E test covers no-user-reference path; one covers multiple-user-reference path; Step 3 remains gated until scene outputs are ready.
   - Likely files: `e2e/storyboard-illustrations.spec.ts`, E2E helpers.
   - Dependencies: frontend/backend status implementation.
   - Validation: Playwright pass with local API proxy setup.

2. Add regression tests for style-reference persistence through autosave.
   - Goal: ensure autosave/full-replace cannot delete reference or scene mappings while jobs are active.
   - Scope: extend existing autosave mapping preservation tests to include canonical reference mappings and sequential scene mappings.
   - Acceptance criteria: active reference and scene mappings survive `PUT /storyboards/:draftId`; completed outputs attach after autosave.
   - Likely files: `apps/api/src/__tests__/integration/storyboard.integration.test.ts`, repository tests.
   - Dependencies: reference mapping model.
   - Validation: API integration tests.

---

Epic — Automated Storyboard Generation and Principal Image Approval:

Goal:
Remove manual user-triggered Step 2 generation controls from the normal storyboard flow and insert a required principal image approval/edit step before scene illustrations are generated from that image.

Product behavior:

1. `Generate scenes` and `Generate illustrations` must not be directly triggerable by users in the standard Step 2 flow.
2. When the user moves from Step 1 to Step 2 and the storyboard contains only the START and END blocks, the system automatically starts scene planning.
3. After scene planning completes and scene blocks are created, the system automatically creates the principal/canonical image first.
4. Before generating scene illustrations from the principal image, the UI must show the principal image to the user in a modal for approval.
5. The modal must let the user adjust the principal image before approval:
   - Add a prompt describing how to change the principal image.
   - Replace the principal image with an uploaded/selected image.
   - Add additional reference images that should be used to regenerate the principal image.
   - Use the available `gpt-image-2` image generation/editing capabilities exposed by the app.
6. Scene illustrations start automatically only after the user approves the principal image.
7. Retry and recovery controls remain available for failed jobs, but the primary happy path should feel automatic rather than button-driven.

Backend tickets:

1. Add storyboard automation state and idempotent orchestration guard.
   - Goal: track whether a draft is eligible for automatic Step 2 orchestration and prevent duplicate scene/illustration jobs.
   - Scope: add or reuse draft/storyboard metadata for automation status, approval status, current phase, error message, and timestamps; treat START+END-only storyboards as eligible for auto planning; keep existing manual retry endpoints idempotent.
   - Acceptance criteria: only one active planning job can exist per eligible draft; re-entering Step 2 does not duplicate blocks or jobs; non-empty storyboards do not auto-replace user work; failures surface as retryable states.
   - Likely files: `apps/api/src/services/generationDraft.storyboardPlan.service.ts`, `apps/api/src/services/storyboardPlanApply.service.ts`, `apps/api/src/repositories/storyboardPlanJob.repository.ts`, `apps/api/src/repositories/generationDraft.repository.ts`, `apps/api/src/db/migrations/*`.
   - Dependencies: existing storyboard plan jobs, storyboard blocks/edges, generation draft persistence.
   - Validation: service tests for empty storyboard eligibility, non-empty storyboard skip, duplicate request idempotency, and failed-job retry.

2. Split principal image generation from scene illustration generation with approval gating.
   - Goal: ensure the canonical principal image is generated and approved before any scene illustration jobs begin.
   - Scope: extend the existing canonical reference flow with `pending_approval` or equivalent state; prevent scene job enqueueing until approval is stored; keep failed reference retries available.
   - Acceptance criteria: principal image output can be ready while scene jobs remain unqueued; approving the principal image unlocks sequential scene generation; rejecting/editing/replacing the image keeps scene generation blocked; retries preserve the latest approved principal image.
   - Likely files: `apps/api/src/services/storyboardIllustration.service.ts`, `apps/api/src/repositories/storyboardIllustrationReference.repository.ts`, `apps/api/src/controllers/storyboardIllustration.controller.ts`, `packages/api-contracts/src/openapi.ts`.
   - Dependencies: completed canonical reference pipeline and direct `storyboard-openai-image` worker.
   - Validation: API tests for reference ready/unapproved, approve, edit/regenerate, replace, and scene enqueue gating.

3. Add principal image edit/regenerate API.
   - Goal: support modal actions for changing the principal image through `gpt-image-2`.
   - Scope: add endpoints to submit a principal-image edit prompt, replace the principal image with an existing/uploaded file, and add extra reference files for regeneration; resolve all references through draft-linked files and authenticated storage.
   - Acceptance criteria: edit prompt creates a new `gpt-image-2` image-edit job using the current principal image plus optional extra references; replacement marks the selected file as the active principal image; extra references are persisted as source reference IDs; old generated outputs remain auditable but inactive.
   - Likely files: `apps/api/src/controllers/storyboardIllustration.controller.ts`, `apps/api/src/services/storyboardIllustration.service.ts`, `apps/api/src/queues/jobs/enqueue-storyboard-openai-image.ts`, `apps/media-worker/src/jobs/storyboardOpenAIImage.job.ts`, `packages/project-schema/src/job-payloads/*`, `packages/api-contracts/src/openapi.ts`.
   - Dependencies: draft file linking, OpenAI image edit worker, canonical reference repository.
   - Validation: endpoint integration tests, worker payload tests, object-storage reference resolution tests.

4. Extend status API for automation and principal approval.
   - Goal: give the frontend one reliable status shape for Step 2 automation, principal image review, and scene illustration progress.
   - Scope: expose automation phase values such as `planning`, `creating_principal_image`, `awaiting_principal_approval`, `generating_scene_illustrations`, `ready`, and `failed`; include principal image output, source refs, approval state, and actionable failure reason.
   - Acceptance criteria: frontend can render progress, approval modal, retry states, and Step 3 gating without inferring state from unrelated fields; OpenAPI examples cover the happy path and failed path.
   - Likely files: `packages/api-contracts/src/openapi.ts`, `packages/api-contracts/src/openapi.storyboard.schemas.test.ts`, `apps/api/src/controllers/storyboardIllustration.controller.ts`, `apps/api/src/services/storyboardIllustration.service.ts`, `apps/web-editor/src/features/storyboard/types.ts`.
   - Dependencies: approval-gated reference model.
   - Validation: OpenAPI tests, controller tests, frontend API contract tests.

Frontend tickets:

1. Remove standard manual generation triggers from Step 2.
   - Goal: make Step 2 generation automatic in the normal flow instead of exposing `Generate scenes` and `Generate illustrations` as primary user actions.
   - Scope: hide or remove the direct generation buttons when auto orchestration is available; keep scoped retry controls for failed planning, principal image generation, and failed scene blocks.
   - Acceptance criteria: entering Step 2 with only START and END starts planning automatically; users cannot manually trigger duplicate scene or illustration generation; retries are visible only when the relevant phase fails.
   - Likely files: `apps/web-editor/src/features/storyboard/components/StoryboardPlanControls.tsx`, `apps/web-editor/src/features/storyboard/hooks/useStoryboardPlanGeneration.ts`, `apps/web-editor/src/features/storyboard/hooks/useStoryboardIllustrations.ts`, `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx`.
   - Dependencies: automation status API.
   - Validation: hook tests and component tests for auto-start, duplicate prevention, and failure retry rendering.

2. Build the principal image approval modal.
   - Goal: let users inspect and adjust the principal image before it is used for scene illustrations.
   - Scope: add a modal opened automatically when status reaches `awaiting_principal_approval`; show authenticated principal image preview; include approve, regenerate with prompt, replace image, and add reference images actions; use existing upload/asset picker patterns.
   - Acceptance criteria: modal blocks Step 3 and scene generation until approval; prompt edits call the regeneration API; replacement updates the active principal image; additional references are shown as removable chips/thumbnails; image load failures have a graceful fallback.
   - Likely files: `apps/web-editor/src/features/storyboard/components/PrincipalImageApprovalModal.tsx`, `apps/web-editor/src/features/storyboard/components/PrincipalImageApprovalModal.styles.ts`, `apps/web-editor/src/features/storyboard/api.ts`, `apps/web-editor/src/features/storyboard/types.ts`, shared asset picker/upload components.
   - Dependencies: principal image status/edit/approve APIs.
   - Validation: component tests for approve, prompt edit, replace, add/remove references, loading, failure, and disabled states.

3. Wire automatic continuation after principal approval.
   - Goal: start scene illustration generation immediately after the user approves the principal image.
   - Scope: update Step 2 orchestration hooks so approval triggers or unlocks the existing sequential scene illustration endpoint; refresh storyboard data as scene outputs attach; keep Back/Home available while generation runs.
   - Acceptance criteria: after approval, scene 1 starts without another user action; subsequent scenes continue sequentially; failed scene generation leaves per-scene retry available; Step 3 remains disabled until all required outputs are ready.
   - Likely files: `apps/web-editor/src/features/storyboard/hooks/useStoryboardIllustrations.ts`, `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx`, `apps/web-editor/src/features/storyboard/components/SceneBlockNode.tsx`, `apps/web-editor/src/features/storyboard/components/StoryboardPageFooter.tsx`.
   - Dependencies: approval-gated backend behavior.
   - Validation: hook tests, focused StoryboardPage tests, Step 3 gating tests.

4. Update Step 2 status copy and visual hierarchy.
   - Goal: communicate automatic progress clearly without showing implementation/provider details.
   - Scope: replace button-led copy with phase-led status for planning scenes, creating principal image, waiting for approval, generating scene illustrations, ready, and failed; follow `docs/design-guide.md` dark theme tokens and 8px radius rules.
   - Acceptance criteria: no visible provider jargon except where model-specific controls are intentionally exposed inside the principal image modal; status text fits at mobile/tablet/desktop breakpoints; controls do not overlap canvas or footer navigation.
   - Likely files: `apps/web-editor/src/features/storyboard/components/StoryboardPlanControls.tsx`, `apps/web-editor/src/features/storyboard/components/StoryboardPlanControls.styles.ts`, modal styles.
   - Dependencies: finalized status values.
   - Validation: component snapshots or DOM assertions plus Playwright visual review.

Tests and validation tickets:

1. Add E2E coverage for automatic Step 2 orchestration.
   - Goal: verify the happy path from Step 1 navigation to automatic planning, principal image approval, automatic scene illustrations, and Step 3 readiness.
   - Scope: mock API/worker statuses and authenticated image streams; assert no manual `Generate scenes` or `Generate illustrations` buttons are available in the normal flow.
   - Acceptance criteria: test covers START+END auto-start, principal modal display, approval, automatic scene generation, final thumbnails, and Step 3 enabling only when all scene outputs are ready.
   - Likely files: `e2e/storyboard-illustrations.spec.ts`, `e2e/helpers/storyboard.ts`.
   - Dependencies: frontend automation and modal implementation.
   - Validation: Playwright pass with local API proxy setup.

2. Add E2E coverage for principal image adjustment paths.
   - Goal: verify users can correct the principal image before scene generation begins.
   - Scope: cover prompt-based regeneration, replacement with an uploaded/selected image, and adding extra reference images before approval.
   - Acceptance criteria: each adjustment path updates the principal preview/status; scene illustrations do not start before approval; approved adjusted image is used as the style anchor in subsequent scene generation requests.
   - Likely files: `e2e/storyboard-illustrations.spec.ts`, asset/upload E2E helpers.
   - Dependencies: modal actions and backend edit/regenerate APIs.
   - Validation: Playwright pass with mocked provider outputs.

3. Add regression coverage for duplicate prevention and user-edited storyboards.
   - Goal: ensure automation does not overwrite user work or create duplicate jobs.
   - Scope: test reloading Step 2 during active planning/reference jobs, entering Step 2 with existing custom blocks, and retrying failed phases.
   - Acceptance criteria: active jobs remain singular; existing storyboard blocks are preserved; retries create only the intended replacement job; completed principal images remain auditable.
   - Likely files: `apps/api/src/__tests__/integration/generationDraft.storyboardPlan.integration.test.ts`, `apps/api/src/__tests__/integration/storyboard-illustration-endpoints.test.ts`, `apps/web-editor/src/features/storyboard/components/StoryboardPage.plan.test.tsx`.
   - Dependencies: automation state and approval model.
   - Validation: API integration tests and focused frontend tests.
