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
