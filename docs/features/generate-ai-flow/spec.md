---
status: Draft
owner: "Product (PM) + Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-03"
feature_size: "L"
---

# Spec — generate-ai-flow

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** None — only the interview + CONTEXT + the `docs/architecture-map.md` system map. Existing rails the spec assumes (model catalog with per-field modality/required declarations, the async generation job pipeline, the user-scoped general library, and the node-canvas editor) are facts of the current system, not external sources.

## 1. Context

¶1 **What we're solving.** A Creator who wants to make AI media in ClipTale today picks a single model from a dropdown, fills a parameter form, and runs one generation; the result is hard to track and impossible to compose with the output of another model. There is no place to *visually* combine models — e.g. write a prompt, turn it into an image, then turn that image into a video — and no persistent surface to iterate on a multi-model idea over time. This feature gives Creators a dedicated, visual, node-based workspace for free-form experimentation with the catalog of AI models.

¶2 **Why now.** The model catalog already declares, per model, its capability and its required/optional inputs by modality — so the information needed to drive typed, model-aware connections exists but is unused beyond a flat form. Competing creative AI tools have moved to node-graph "workflow" canvases; the differentiating gap none of them closes is a *creator-grade* canvas that (a) enforces input compatibility visually before any paid generation, (b) treats audio as a first-class modality alongside image and video, and (c) makes every result an asset in the Creator's existing library automatically. ClipTale already has the node-canvas editor, the generation pipeline, and the library — the pieces are in place to claim that gap.

¶3 **The committed approach.** Build a **Guided Visual Flow** (the approach the ideation pass recommended across all four lenses): a new "Generate AI" page listing the Creator's saved flows; each flow opens a node canvas where the Creator adds content blocks and generation blocks, draws **typed connections** that are blocked at connect-time when modalities don't match, edits optional model parameters in a side inspector, and presses **Generate** on one block at a time (its inputs must already be resolved — no automatic execution of the upstream chain in this version). Each Generate, after a cost confirmation, auto-creates a result block and saves the output to the general library, linked back to the flow. The canvas *looks like* a pipeline but executes one block per click; multi-step results are produced by pressing Generate in sequence.

¶4 **Traceability context.** This feature reuses, not replaces, the existing single-model generation experiences. Result persistence, library linkage, and async progress follow the existing generation-job and library patterns recorded in `docs/architecture-map.md`. The node-canvas layout follows the same editor family as the storyboard Step 2 canvas.

## 2. Goals

- Let a Creator visually combine multiple AI models (across text, image, video, audio) in one saved workspace to craft a desired image, video, or audio result.
- Make every generated result a persistent, reusable asset in the Creator's general library, linked back to the flow that produced it, so no generation is lost or untracked.
- Prevent wasted, paid generations by surfacing model-input compatibility visually (incompatible connections blocked) and confirming cost before any provider call.

## 3. Non-goals

- **Not replacing** the existing single-model dropdown wizard or in-editor generation — they coexist; this is an additional, separate workspace (so existing users keep their fast path).
- **Not auto-executing the upstream chain** — pressing Generate runs only the selected block; running a multi-step chain means pressing Generate per block in order (auto-DAG orchestration is a deliberate future epic, excluded to contain cost and failure surface).
- **Not adding new AI models or providers** — the feature drives the *existing* model catalog; expanding the catalog is out of scope.
- **Not real-time multi-Creator collaboration** on a single flow — flows are single-owner; concurrent multi-user editing of one flow is out of scope.
- **Not multi-output per Generate** — in v1 a single Generate produces exactly one result into one result block (models that can emit several outputs are run for one); generating multiple variants in one click is a future enhancement, deferred to keep the result-block↔library linkage one-to-one and avoid orphaned assets.

## 4. User stories

### US-01: Manage generation flows

**As a** Creator
**I want** to see a list of my generation flows on the Generate AI page and create, open, rename, or delete them
**So that** I can keep multiple experiments organized and return to any of them later

### US-02: Assemble a flow on the canvas

**As a** Creator
**I want** to add content blocks (text, image, audio, video) and generation blocks (image, video, audio) onto the canvas
**So that** I can lay out the building pieces of the media I want to create

### US-03: Connect inputs to a generation block

**As a** Creator
**I want** each generation block to show input handles that match the chosen model's required inputs, and to connect compatible blocks into them
**So that** I always know what a model needs and can wire it up correctly

### US-04: Provide content and parameters

**As a** Creator
**I want** to type text, upload media, or pick existing assets from my library into content blocks, and tune a model's optional parameters in a side inspector
**So that** I control exactly what goes into a generation without cluttering the canvas

### US-05: Generate a result

**As a** Creator
**I want** to press Generate on a block, confirm the estimated cost, and have the result appear in an auto-created result block and in my general library
**So that** I get a tracked, reusable output with one deliberate action

### US-06: Follow progress and outcome

**As a** Creator
**I want** the result block to show generation progress and then the produced media, with image results shown as a large dominant preview
**So that** I can judge the result at a glance while a generation runs asynchronously

### US-07: Reuse results and reload flows

**As a** Creator
**I want** to feed a generated result into another generation block and to reopen a saved flow with its prior results still shown
**So that** I can build multi-step results step by step and continue an experiment across sessions

## 5. Acceptance criteria

### AC-01 (US-05) — happy path

**Given** a Creator owns an open flow with a text content block connected to the text input of an image-generation block whose required inputs are all satisfied
**When** the Creator presses Generate on the image-generation block and confirms the estimated cost
**Then** the system creates a new connected result block (prior result blocks on this generation block are retained as a history of runs), shows it producing the image, and on completion displays the image in the result block and adds it to the Creator's general library linked to this flow

### AC-15 (US-02) — happy path (assemble blocks)

**Given** a Creator has an open flow canvas
**When** the Creator adds content blocks (text, image, audio, video) and a generation block, and selects a model on the generation block
**Then** the blocks appear on the canvas, the generation block shows the input handles for the selected model's required inputs, and the additions become part of the saved flow

### AC-16 (US-04) — happy path (provide content and parameters)

**Given** a Creator owns an open flow with a content block and a selected generation block
**When** the Creator types into the text block (or uploads a file / picks an existing library asset into a media block) and edits the generation block's optional parameters in the inspector
**Then** the system retains the supplied content and parameter values on those blocks and uses them on the next Generate

### AC-02 (US-03) — domain invariant violation (model-input compatibility)

**Given** a Creator is editing a flow and drags a connection from a text content block toward the image input handle of an image-to-video generation block
**When** the Creator attempts to drop the connection on that image input handle
**Then** the system refuses the connection and indicates that the handle accepts an image input, not text (the incompatible connection is never created)

### AC-03 (US-05) — error (missing required input)

**Given** a Creator owns an open flow with a generation block whose selected model has a required input that has no compatible connection
**When** the Creator presses Generate on that block
**Then** the system blocks the run before any provider call and tells the Creator, in plain language, which required input must be connected first

### AC-04 (US-01) — authorization (non-owner)

**Given** a signed-in Creator who is not the owner of a particular flow
**When** that Creator tries to open or act on that flow
**Then** the system denies access and does not reveal the flow's contents, because flows are private to their owner

### AC-05 (US-07) — cross-context (library dependency)

**Given** a Creator's flow has an image content block that references an asset from the general library, and that asset is no longer available in the library
**When** the Creator presses Generate on a block that depends on that asset
**Then** the system blocks the run and tells the Creator that the referenced library asset is missing and must be replaced, rather than sending an empty input to the model. This missing-asset message is shown only for an asset the Creator previously owned in their own library; a reference to an asset the Creator never owned is denied per AC-04 without revealing whether it exists

### AC-06 (US-05) — domain invariant violation (alternative-input exclusivity)

**Given** a Creator owns a generation block whose selected model requires exactly one of two alternative inputs and the Creator has satisfied both (or neither)
**When** the Creator presses Generate and confirms the cost
**Then** the system blocks the run before any provider call and tells the Creator that exactly one of the two alternatives must be provided

### AC-07 (US-03) — domain invariant (model change reconciles handles)

**Given** a Creator has connected inputs to a generation block and then changes the block's selected model to one with different required inputs
**When** the model change is applied
**Then** the system rebuilds the block's input handles for the new model and removes any now-incompatible connections, telling the Creator which connections were removed; any result block already produced on this generation block and its library linkage are preserved unchanged (only input connections are affected)

### AC-08 (US-06) — happy path (async progress and dominant preview)

**Given** a Creator has started a generation that runs asynchronously
**When** the generation is in progress and then completes
**Then** the result block shows live progress while running and, on completion, displays the produced media as the dominant visible area of the block — an image as a large preview, a video or audio result as a large player — occupying the majority of the block, with controls and labels secondary

### AC-08b (US-06) — async edge (tab closed mid-generation)

**Given** a Creator started a generation and then closed the tab or navigated away while it was still running
**When** the Creator reopens the same flow
**Then** the result block reattaches to the generation's live progress (or shows its last-known running/finished state); a generation that completed while away has its result shown and added to the general library, and a generation that failed while away shows the AC-09 failed state with a retry option on reopen — the outcome is never lost because the Creator left

### AC-09 (US-05) — error (failed or charged-but-empty generation)

**Given** a Creator has started a generation that the provider fails or returns no usable output for
**When** the generation finishes unsuccessfully
**Then** the result block shows a clear failed state with the reason in plain language and an option to retry, and no broken or empty asset is added to the general library; retry is a fresh Generate — it re-shows the cost confirmation, may incur a new charge, and counts against the generation rate limit (it is not a free re-run of the failed attempt)

### AC-10 (US-01) — happy path (flow lifecycle persists)

**Given** a Creator has built a flow with blocks, connections, positions, and at least one result
**When** the Creator leaves and later reopens the flow from the Generate AI page
**Then** the system restores the canvas with the same blocks, connections, parameters, and previously produced results shown in their result blocks

### AC-10b (US-01) — concurrency edge (same flow in two tabs)

**Given** a Creator has the same flow open in two browser tabs and edits both
**When** the second tab saves changes over a flow the first tab also changed
**Then** the system protects against silent loss — it detects the conflicting save, rejects the second tab's save and warns the Creator, leaving the first save's state authoritative; the Creator must reload the flow to continue editing (the other tab's changes are never overwritten without notice)

### AC-11 (US-05) — error (cost confirmation gate)

**Given** a Creator presses Generate on a block with all required inputs satisfied
**When** the cost confirmation is shown and the Creator cancels (does not confirm)
**Then** the system makes no paid provider call and the flow is unchanged (no result block content, no library asset, no charge)

### AC-12 (US-05) — happy path (audio generation, first-class modality)

**Given** a Creator owns an open flow with a text content block connected to the text input of an audio-generation block whose required inputs are all satisfied
**When** the Creator presses Generate and confirms the estimated cost
**Then** the system produces the audio into a connected result block (playable on completion) and adds it to the Creator's general library linked to this flow — audio is generated the same first-class way as image and video

### AC-13 (US-05) — happy path (video generation)

**Given** a Creator owns an open flow with an image content block connected to the image input of an image-to-video generation block whose required inputs are all satisfied
**When** the Creator presses Generate and confirms the estimated cost
**Then** the system produces the video into a connected result block (playable on completion) and adds it to the Creator's general library linked to this flow

### AC-14 (US-05) — domain invariant (single result per Generate)

**Given** a Creator owns a generation block whose selected model is capable of emitting several outputs in one run
**When** the Creator presses Generate and confirms the cost
**Then** the system produces exactly one result into one result block and links exactly one asset to the library — the first output the provider returns is kept and any additional outputs are discarded — consistent with the v1 one-result-per-Generate rule

### AC-17 (US-04) — error (empty or invalid content block)

**Given** a Creator owns an open flow where a generation block's required input is connected to a content block that is empty (a text block with no text) or holds invalid media (an unsupported file type or size)
**When** the Creator presses Generate on that block
**Then** the system blocks the run before any provider call and tells the Creator, in plain language, which content block is empty or invalid and must be fixed first

### AC-18 (US-07) — happy path (reuse a result as input)

**Given** a Creator owns a flow with a completed result block and a second generation block whose selected model has an input handle matching the result's modality
**When** the Creator draws a connection from the result block's output to that compatible input handle
**Then** the system accepts the connection and, on the next Generate of the second block, uses the produced result as that input — results are reused by connecting the result block directly, without first re-importing it through the library

### AC-19 (US-01) — cross-context (delete flow preserves library assets)

**Given** a Creator deletes a flow that produced one or more result assets now stored in the general library
**When** the deletion completes
**Then** the flow with its blocks and connections is removed but the generated assets remain in the Creator's general library (only the flow linkage is dropped) — deleting a flow never deletes the Creator's library assets

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95 — open a saved flow (canvas ready) | ≤ 1500 ms for a typical flow (the working assumption for "typical" — and any per-flow block cap — is the large-flow performance open question in §8) | client navigation timing metric |
| Latency p95 — connection draw / handle feedback | ≤ 100 ms from drop to accept/reject visual | client interaction metric |
| Latency p95 — flow autosave acknowledged | ≤ 800 ms | client→server save round-trip metric |
| Generation rate limit (abuse guard) | ≤ 30 Generate runs / minute / Creator (default — final value in §8) | server-side rate-limit counter, enforced regardless of UI |
| Availability (Generate AI page + flow APIs) | 99.5% | monthly SLO window |
| Result integrity | a result asset is added to the library only on successful generation; failed runs add none | generation-job outcome vs library-write reconciliation |

## 6.1 Security / privacy

- **Data classification:** confidential — flows and their results are private creative work owned by one Creator; library assets may include uploaded source media.
- **Personal data touched:** none new beyond what the existing library already holds (uploaded media may incidentally contain personal content; no new personal-data fields are introduced).
- **AuthZ/AuthN impact:** all flow read/write/list/delete and all Generate actions are owner-scoped — every operation must be filtered by the calling Creator's identity; a Creator can never read or act on another Creator's flow or its result assets. Result assets are written into the acting Creator's own library only.
- **Abuse cases:**
  - Cross-Creator flow access: deny and do not reveal existence — flows are private to their owner.
  - Generation spam / cost abuse (direct calls bypassing the UI cost confirmation): enforce a server-side per-Creator rate limit on Generate so the confirmation cannot be bypassed by scripting; the UI confirmation alone is insufficient.
  - Charged-but-no-result: never link a failed/empty generation as a library asset; surface a retry instead of a broken asset.
  - Prompt/text injection through content fields: text inputs are passed to providers as content only, never interpreted as instructions to ClipTale; standard input sanitization applies.
- **Security review:** Required — new owner-scoped resource (flows), a new spend-bearing action surface, and a financial-abuse vector (uncapped paid generation).

## 7. Metrics / KPIs

- **Standalone-generation migration to flows** — baseline: 0% (flows don't exist), target: ≥ 40% of standalone (non-in-editor) AI generations initiated via flows within 60 days of launch.
- **Completed-flow rate** — baseline: 0, target: ≥ 70% of created flows produce at least one successful result.
- **Multi-block composition** — baseline: 1 generation per standalone session (wizard), target: ≥ 3 generation blocks per active flow session within 60 days.
- **Result reuse** — baseline: 0%, target: ≥ 25% of flow-generated results are reused (re-fed as input within a flow, or used elsewhere in the editor) within 7 days. Measured from existing library-usage telemetry plus in-flow reuse connections — no new cross-surface tracking is built for this KPI.

## 8. Open questions

- [ ] What are the exact generation rate-limit thresholds and any credit/quota policy per Creator (and per plan tier)? Default now: ≤ 30 Generate runs/min/Creator as an abuse guard, no credit quota. — owner: Product/Business owner, due: before `sdd:tasks`
- [ ] Where does the per-model cost estimate come from — the model catalog does not currently carry pricing metadata, and providers bill on actual output (duration/resolution/retries) which isn't known until completion? Default now: show a best-effort estimate from static per-model pricing; reconcile against actuals out of band. — owner: Tech Lead + Business owner, due: before `sdd:api`
- [ ] What is the refund/credit policy when a Creator is charged for a generation that fails or returns unusable output? Default now: no automatic refund; retry offered. — owner: Product/Business owner, due: before launch
- [ ] How much flow history is needed — does the flow need undo/redo and version snapshots like projects, or is autosave plus conflict-detection enough for v1? (Conflict-detection on concurrent saves is committed by AC-10b and is **not** part of this question — this question is only about undo/redo depth and version snapshots.) Default now: autosave + AC-10b conflict warning, no undo/redo history. — owner: Tech Lead, due: before `sdd:design`
- [ ] What is a "typical" flow size for the §6 open-latency target, and is there a per-flow block cap beyond which performance is not guaranteed (large graphs with many image previews are the heaviest case)? Default now: target holds for flows up to ~50 blocks; no hard cap enforced. — owner: Tech Lead, due: before `sdd:design`
- [ ] Does the model catalog already declare alternative-input exclusivity groups (the "exactly one of two" rule AC-06 relies on), or must that schema be added? Default now: assume the catalog can express exclusivity groups; validate during `sdd:data-model` and model it there if absent. — owner: Tech Lead, due: before `sdd:data-model`
