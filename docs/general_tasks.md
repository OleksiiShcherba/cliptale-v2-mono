● EPIC: Video Generation By Prompt — Step 1 (Script & Media)

  Goal: Build the first step of the prompt-to-video wizard where a creator writes a story prompt, embeds media reference tokens (video/image/audio) inline, optionally runs AI Enhance to rewrite the prompt, browses their existing asset gallery on the right side, and continues to Step 2 (Video Road Map).

  Persona: Authenticated ClipTale creators (role: user) who already have assets in their library.

  Constraints: Auth required. Depends on existing asset/upload pipeline (asset.service.ts, media-worker ingest). New generation_draft is a sibling of ProjectDoc — not a full project until Step 3 commits.

  ---
  Pages / Surfaces

  - Generate Wizard shell (/generate) — top stepper, two-column body, footer actions
  - Step 1 — Script & Media — prompt editor (left) + media gallery (right) + Pro Tip card
  - Asset Picker Modal — opened by "Insert Video/Image/Audio" buttons; filtered subset of gallery
  - Upload Dropzone — opened by gallery upload icon; reuses existing ingest pipeline

  ---
  Tickets

  🔵 Backend First

  ---
  [DB] Create generation_drafts table + Zod schema for PromptDoc

  Description
  Persistent store for an in-progress generation wizard. Holds the prompt as a structured document (text segments + media-reference tokens) so it survives page reloads and can be picked up at Step 2. Add a prompt_doc JSON column validated by a new Zod schema in packages/project-schema/src/schemas/promptDoc.schema.ts.

  Acceptance Criteria
  - Migration apps/api/src/db/migrations/0NN_generation_drafts.sql creates generation_drafts(id PK, user_id FK, prompt_doc JSON NOT NULL, status ENUM('draft','step2','step3','completed'), created_at, updated_at)
  - Index on (user_id, updated_at DESC) for "resume latest draft"
  - PromptDoc Zod schema in packages/project-schema/: { blocks: Array<{ type: 'text', value: string } | { type: 'media-ref', mediaType: 'video'|'image'|'audio', assetId: string, label: string }> }
  - PromptDoc exported from packages/project-schema/src/index.ts
  - Schema rejects unknown block types and missing assetId
  - Migration runs cleanly on a fresh DB and can be rolled back

  Dependencies None
  Effort S

  ---
  [BE] generation-drafts repository + service + CRUD endpoints

  Description
  Standard layered CRUD (routes → controllers → services → repositories) for generation_drafts. Supports create, get-by-id, list-mine, update (full PromptDoc replacement), and delete. Service enforces ownership via acl.middleware.

  Acceptance Criteria
  - apps/api/src/routes/generationDrafts.routes.ts with: POST /generation-drafts, GET /generation-drafts/:id, GET /generation-drafts?mine=true, PUT /generation-drafts/:id, DELETE /generation-drafts/:id
  - Controller is thin — parse → call service → return
  - Service validates prompt_doc against PromptDoc Zod schema before writing
  - Repository handles all SQL; throws NotFoundError when missing
  - All endpoints return 401 if unauthenticated, 403 if not owner, 404 if not found, 422 on schema validation failure
  - OpenAPI spec in packages/api-contracts/ updated and TS client regenerated
  - Unit tests for the service (happy + 3 error paths)

  Dependencies DB ticket above
  Effort M

  ---
  [BE] GET /assets — gallery listing with type filter and pagination

  Description
  The right-side Media Gallery panel needs a paginated, type-filterable feed of the user's ready assets, grouped client-side into Videos / Images / Audio. Endpoint must return only assets where ingest finished (status='ready').

  Acceptance Criteria
  - GET /assets?type=video|image|audio|all&cursor=...&limit=... in assets.routes.ts
  - Returns { items: AssetSummary[], nextCursor: string|null, totals: { videos, images, audio, bytesUsed } }
  - AssetSummary includes id, type, label, durationSeconds?, thumbnailUrl, createdAt
  - Service filters by req.user.id and status='ready'
  - Cursor pagination via (updated_at, id); default limit=24, max 100
  - Unauthorized → 401; unknown type → 422
  - Repository unit-tested against a seeded DB

  Dependencies None (existing assets table)
  Effort S

  ---
  [INT] AI prompt-enhance endpoint backed by OpenAI

  Description
  "AI Enhance" button rewrites the user's prompt while preserving inline media-ref tokens. Add POST /generation-drafts/:id/enhance which sends the current PromptDoc to the LLM with a system prompt that forbids mutating media-ref blocks and returns a new PromptDoc. Long requests run via BullMQ (ai-enhance queue) with polling, matching how transcription works.

  ⚠️  Token preservation is the trickiest part — the LLM must round-trip media-ref blocks exactly. Implement as: serialize blocks with sentinels (e.g. {{MEDIA_1}}), send text only, splice tokens back into the LLM result.

  Acceptance Criteria
  - POST /generation-drafts/:id/enhance enqueues a job and returns { jobId }
  - GET /generation-drafts/:id/enhance/:jobId returns { status: 'queued'|'running'|'done'|'failed', result?: PromptDoc, error? }
  - Job handler in apps/media-worker/src/jobs/enhancePrompt.job.ts (new file) — calls OpenAI, replaces sentinels, validates result against PromptDoc Zod schema
  - All media-ref blocks present in input MUST be present in output (verified by test)
  - Failed enhancement does not mutate the stored draft
  - Rate limit: 10 requests / user / hour (return 429)
  - Unit tests cover: token preservation, schema-invalid LLM output, OpenAI 5xx retry

  Dependencies Generation drafts CRUD
  Effort L

  ---
  🟢 Can Be Parallelised (Frontend)

  ---
  [FE] Generate wizard route + layout shell with stepper

  Description
  New route /generate rendering the wizard shell: top stepper (Step 1 active), two-column body slot, bottom footer slot. Lives under apps/web-editor/src/features/generate-wizard/. Stepper is a presentational component reading current step from a local useState (Step 1 only for now; Step 2/3 routes ship in later epics).

  Acceptance Criteria
  - Folder features/generate-wizard/{components,hooks,api.ts,types.ts} created per architecture rules
  - GenerateWizardPage.tsx mounted at /generate
  - WizardStepper.tsx displays 3 steps with active/inactive states matching design tokens (primary, surface-elevated, border)
  - Layout uses 12-col grid, left col = 8 / right col = 4 at lg
  - Sidebar nav highlights "Generate" entry as active
  - Matches design at 1280×900 viewport pixel-for-pixel for spacing/colors
  - No business logic in the page component

  Dependencies None (can use mock data)
  Effort S

  ---
  [FE] PromptEditor — contenteditable rich text with media-ref token chips

  Description
  Core text editor for the prompt. Supports plain typing plus inline non-editable "chips" representing media-ref tokens (video=blue, image=warning/amber, audio=success/green) per design. Backed by a tiny custom contenteditable controller (no full WYSIWYG framework — too heavy). Emits PromptDoc on change.

  ⚠️  Caret/selection management around non-editable chips is the main complexity — chips must be deletable with Backspace and skip on arrow keys.

  Acceptance Criteria
  - PromptEditor.tsx accepts value: PromptDoc and onChange: (next: PromptDoc) => void
  - Renders text and chips matching design (icon + label, colored border + tinted bg)
  - Typing produces text blocks; insertMediaRef(asset) inserts at caret
  - Backspace at start of a chip removes it; arrow keys treat chip as a single caret position
  - Character counter (245 / 2000) updates live; blocks input over limit
  - Focus ring uses primary/50 per design
  - Uncontrolled selection survives re-renders
  - Vitest tests cover: insert, delete, max-length, round-trip PromptDoc

  Dependencies PromptDoc Zod type from project-schema
  Effort L

  ---
  [FE] PromptToolbar — AI Enhance + Insert Video/Image/Audio buttons

  Description
  Toolbar row beneath the editor. AI Enhance triggers the enhancement flow. Insert buttons open the Asset Picker modal pre-filtered to the chosen type and, on selection, call editor.insertMediaRef(...).

  Acceptance Criteria
  - Four buttons rendered with icons + labels per design (colors: AI=neutral, video=info, image=warning, audio=success)
  - Each Insert button opens AssetPickerModal with mediaType prop
  - On asset chosen, the editor updates and modal closes
  - AI Enhance button is disabled while a job is running and shows a spinner
  - Buttons keyboard-accessible (Tab order, Enter/Space)

  Dependencies PromptEditor; AssetPickerModal
  Effort S

  ---
  [FE] useEnhancePrompt hook + AI Enhance flow with diff preview

  Description
  Hook that POSTs to enhance, polls the job, and on done shows a confirmation dialog with the proposed PromptDoc so the user can accept or discard. Uses React Query for polling with backoff.

  Acceptance Criteria
  - features/generate-wizard/hooks/useEnhancePrompt.ts
  - Returns { start, status, proposedDoc, accept, discard, error }
  - Polling interval 1s, max 60s, then fail
  - EnhancePreviewModal.tsx shows side-by-side or inline diff and Accept / Discard buttons
  - Accepting calls onChange of the editor and saves draft
  - Discarding leaves the original prompt untouched
  - Error toast on failure or rate-limit (429)
  - Tested with mocked API client

  Dependencies BE enhance endpoint; PromptEditor
  Effort M

  ---
  [FE] AssetPickerModal — gallery filtered by media type

  Description
  Modal shown when an Insert button is pressed. Lists the user's ready assets filtered to a single type, lets them click to embed, and exits. Reuses query hooks from the Media Gallery panel.

  Acceptance Criteria
  - AssetPickerModal.tsx accepts mediaType: 'video'|'image'|'audio' and onPick(asset)
  - Calls useAssets({ type }) (React Query)
  - Renders skeleton, error, and empty states per architecture rules
  - Click on card → onPick and modal closes
  - Closes on Esc and backdrop click
  - Has its own upload affordance that reuses the existing upload hook (no duplication)

  Dependencies GET /assets BE ticket; existing upload hook
  Effort M

  ---
  [FE] MediaGalleryPanel — right side panel with tabs, categories, footer stats

  Description
  Right-column panel mirroring the design: header (folder icon + "Media Gallery" + upload button), Recent/Folders tabs, scrollable list grouped by Videos / Images / Audio with the exact card variants from the screenshot, footer with selected count + storage used.

  Acceptance Criteria
  - MediaGalleryPanel.tsx, MediaGalleryHeader.tsx, MediaGalleryTabs.tsx, AssetThumbCard.tsx, AudioRowCard.tsx
  - Uses useAssets({ type: 'all' }) and groups results client-side
  - Recent tab is default; Folders tab shows an "empty for now" placeholder (Folders ships in a later epic)
  - Each card supports hover state with + overlay matching design
  - Clicking a card calls onAssetSelected(asset) (wired by parent to editor.insertMediaRef)
  - Skeleton, empty, and error states match the design system
  - Footer displays {n} Assets Selected and {x} GB used from the API totals
  - Scrollable area; panel height fixed at 580px per design

  Dependencies GET /assets BE ticket
  Effort M

  ---
  [FE] useGenerationDraft hook with debounced autosave

  Description
  Hook that creates a draft on first edit and PUTs the latest PromptDoc 800 ms after the last change. Reads/writes via the typed API client. Surfaces isDirty and lastSavedAt for the UI.

  Acceptance Criteria
  - useGenerationDraft(initial?) returns { draftId, doc, setDoc, status, lastSavedAt }
  - First setDoc after mount creates a draft (POST /generation-drafts)
  - Subsequent setDoc calls are debounced 800 ms then PUT
  - Uses React Query mutations; invalidates the draft query on success
  - Failed save shows a toast and retries once
  - Vitest tests with fake timers cover debounce + create-then-update sequence

  Dependencies Generation drafts CRUD BE ticket
  Effort M

  ---
  [FE] Wizard footer: Cancel + "Next: Video Road Map"

  Description
  Bottom action row. Cancel deletes the draft (with confirm dialog) and routes back to the previous page. Next persists the latest PromptDoc synchronously and routes to /generate/road-map (route placeholder for the next epic).

  Acceptance Criteria
  - Cancel shows confirm dialog, then DELETE /generation-drafts/:id and navigates away
  - Next is disabled when PromptDoc has zero text blocks AND zero media refs
  - Next forces a flush of any pending autosave before navigation
  - Next button matches primary CTA design (gradient/primary, shadow, active scale)
  - Loading state on Next while flushing

  Dependencies useGenerationDraft
  Effort S

  ---
  [FE] ProTipCard — dismissible floating hint

  Description
  Bottom-right floating card matching the design. Dismissed state persists in localStorage so it doesn't reappear after dismissal.

  Acceptance Criteria
  - Renders only when localStorage['proTip:generateStep1'] !== 'dismissed'
  - Close button writes the flag and unmounts
  - Matches design tokens (surface-elevated, primary/30 border)
  - Does not overlap any focusable controls in the gallery panel

  Dependencies None
  Effort XS

  ---
  📋 Backlog (Build Order)

  ┌─────┬───────────────────────────────────────────────────┬──────┬────────┬────────────┐
  │  #  │                      Ticket                       │ Area │ Effort │ Depends On │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 1   │ Create generation_drafts table + PromptDoc schema │ DB   │ S      │ —          │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 2   │ generation-drafts CRUD + service + repo           │ BE   │ M      │ #1         │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 3   │ GET /assets gallery listing endpoint              │ BE   │ S      │ —          │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 4   │ AI prompt-enhance endpoint (BullMQ + OpenAI)      │ INT  │ L      │ #2         │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 5   │ Generate wizard route + stepper shell             │ FE   │ S      │ —          │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 6   │ PromptEditor with chip controller                 │ FE   │ L      │ #1         │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 7   │ PromptToolbar                                     │ FE   │ S      │ #6, #9     │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 8   │ useEnhancePrompt + preview modal                  │ FE   │ M      │ #4, #6     │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 9   │ AssetPickerModal                                  │ FE   │ M      │ #3         │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 10  │ MediaGalleryPanel                                 │ FE   │ M      │ #3         │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 11  │ useGenerationDraft autosave hook                  │ FE   │ M      │ #2         │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 12  │ Wizard footer (Cancel / Next)                     │ FE   │ S      │ #11        │
  ├─────┼───────────────────────────────────────────────────┼──────┼────────┼────────────┤
  │ 13  │ ProTipCard                                        │ FE   │ XS     │ —          │
  └─────┴───────────────────────────────────────────────────┴──────┴────────┴────────────┘

  Build Order Recommendation

  Start backend in order #1 → #2 → #3 (small and unblocking) so frontend can move against a real API. Spin up frontend immediately on #5, #6, #13 (they need no backend). #4 (AI Enhance) is the riskiest ticket — kick it off in parallel with the other BE work because the token-preservation strategy may need iteration. #10 and #9 can start as soon as #3 lands. #11 and #12
  wait on #2. Leave #8 (AI Enhance UI) for last so it consumes a working enhance endpoint instead of a moving target.

  ⚠️  Phase Split Recommendation

  13 tickets including one L. Suggest splitting the Trello card into:

  - Phase 1 — Core Flow (must-ship): #1, #2, #3, #5, #6, #7, #9, #10, #11, #12 → user can write a prompt, embed media from gallery, save draft, and advance to Step 2.
  - Phase 2 — AI + Polish: #4, #8, #13 → AI Enhance and the Pro Tip card.

  This lets you ship a usable Step 1 without waiting on the LLM integration.