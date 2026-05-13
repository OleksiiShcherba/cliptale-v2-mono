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
   - Resolve prompt media refs into useful context: metadata, thumbnails, transcripts where available, and signed URLs where needed.
   - Call OpenAI with multimodal context.
   - Return and persist a structured instruction array with scene number, prompt, visual prompt, duration seconds, referenced media, transition notes, and style.
   - Derive scene count from selected video length.

4. Create storyboard scenes from the AI plan.
   - Add bulk creation service for scene blocks from the plan.
   - Create scene blocks with `name`, `prompt`, `duration_s`, `sort_order`, `style`, and media refs.
   - Auto-connect graph as `START -> scene 1 -> scene 2 -> ... -> END`.
   - Push a storyboard history snapshot after generation.
   - Surface progress/errors in the Step 2 UI.

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
