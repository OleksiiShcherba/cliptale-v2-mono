---
status: Draft
owner: "Product Owner (ClipTale)"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-17"
feature_size: "L"
---

# Spec — ai-motion-graphic

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** `docs/architecture-map.md` (current architecture); storyboard media model (`apps/api/src/db/migrations/033_storyboard_block_media.sql`); the cost-estimate+confirm pattern (`apps/api/src/services/storyboardPipeline.cost.service.ts` — instrument-only, server re-validated) — plus the owner's brief and the CONTEXT glossary.

## 1. Context

ClipTale Creators assembling AI-generated series hit a hard wall: the frames that must show **system screens** — forms, logs, dashboards, numbers, animated titles, lower-thirds, subtitles — are exactly the frames diffusion-based AI video generators render worst. Letters warp and mutate between frames, pixel precision is impossible, and the same on-screen text looks different in episode 2 than in episode 7. There is no way today inside ClipTale to produce text/UI motion that is crisp, exact, and consistent across episodes. The affected segment is every Creator who needs readable on-screen text or UI mockups — not just series authors, but anyone making title cards, lower-thirds, or infographic screens.

Why now: ClipTale already owns the full asset→storyboard→render pipeline, and the on-screen-text weakness of AI video models is a documented, unfixed industry limitation — competitors either generate flat exported clips with no reuse (Swishy, Vibe Motion) or require professional desktop authoring with no AI path (the After Effects template system). No product combines a describe→iterate-in-chat authoring loop with deterministic, code-rendered output that lives as a first-class reusable asset inside a video editor. That gap is currently unoccupied and is ClipTale's wedge.

The committed approach (MVP1): a new **AI Motion Graphic** page, peer to Projects / Storyboard / Generate AI, where a Creator describes a graphic, an AI authors a reusable code-backed **Motion Graphic**, previews it live, and refines it through a persistent **chat history** that remains the graphic's editable source forever. The graphic is then reusable as a **media asset** (peer to image/video/audio) attached to **storyboard blocks**, carrying a fixed **duration** that the Creator sets via an *animation duration (seconds)* input shown above the chat — the AI authors the animation to fit that length. Reuse in MVP1 is by duplication; a typed **props schema** (shape only — no validation or prop forms yet) and a version-capable shape are laid into the model from day one so that insertion-point parameterization and version-pinning can be added later without a rewrite. Graphics are strictly per-Creator (no cross-account sharing in MVP1), and AI calls are gated by the existing **cost-estimate + confirm** mechanism. Code is authored exclusively through AI prompts (no hand-written-code path); MVP1 executes that code **only in the browser live preview** — server-side execution that renders an attached graphic into final exported video is deferred to a later milestone (see §3, §8).

Traceability context: the cost gate reuses the instrument-only, server-re-validated estimate pattern already in the storyboard pipeline (no credit ledger). The asset-attachment model mirrors the existing storyboard media pivot, extended with a new motion-graphic kind. The owner's long-term direction is **native live-code rendering at export** (ideal quality + future live re-parameterization) over pre-rendering to an alpha video; **MVP1 does not build server-side execution** — the graphic's code runs only in the browser live preview, and rendering an attached graphic into final exported video is deferred to a later milestone. Because MVP1 executes code only in the author's own browser and graphics are never shared, a generated graphic can only affect its own author's session; the sharp server-side execution risk is therefore out of MVP1 scope and tracked in §8 (OQ-1) for the export milestone.

## 2. Goals

- Give Creators a reliable way to produce pixel-precise, readable on-screen text/UI motion that AI video generation cannot, authored entirely through natural-language description and chat iteration.
- Make a Motion Graphic a genuinely reusable asset: created once, re-used across a Creator's projects and storyboard blocks, with its authoring chat resumable at any time.
- Establish the data + interaction foundation (typed props schema, fixed duration, snapshot-on-insertion) so later milestones add insertion-point parameterization, project design tokens, and version-pinning additively rather than by rewrite.

## 3. Non-goals

- **Cross-account sharing / a shared template library** — graphics are private to their owning Creator in MVP1, because executing one Creator's code in another's session is a worm/stored-code risk we are deliberately not opening yet.
- **Editing props at the insertion point + auto-generated prop forms (MVP2)** — the props schema is stored but values are not editable per placement yet; reuse with different text is done by duplication, to keep MVP1's surface small.
- **Project-level design tokens injected into generation (MVP2)** — visual-system unification across a project is deferred so the first release ships the core authoring loop.
- **Versioning UI, instance re-pinning, propagated edits, and component fork (MVP3)** — instances are frozen snapshots at insertion; there is no UI to re-point a placed instance to a newer version in MVP1.
- **Pre-render-to-alpha-video on publish** — the owner committed to native live-code rendering; the alternate freeze-to-video render path is out of scope.
- **Server-side execution / final video export of a Motion Graphic (deferred)** — in MVP1 the graphic's code executes only in the browser live preview; rendering an attached graphic server-side into final exported video — and the execution isolation that safe server-side rendering requires — is deferred to a later milestone. Attaching a graphic in MVP1 stores its code snapshot for that future render but does not itself produce exported video frames from the graphic.

## 4. User stories

### US-01: Browse my Motion Graphics

**As a** Creator
**I want** to open a dedicated page listing the Motion Graphics I have created
**So that** I can find, reopen, and reuse them without recreating them

### US-02: Generate a Motion Graphic from a prompt

**As a** Creator
**I want** to describe a motion graphic in plain language and have the AI author it
**So that** I get a crisp, animated text/UI graphic without writing code myself

### US-03: Preview a Motion Graphic live

**As a** Creator
**I want** to watch the generated graphic play back full-screen in real time
**So that** I can judge whether it looks right before using it

### US-04: Refine a Motion Graphic through chat

**As a** Creator
**I want** to send follow-up instructions in the graphic's chat and see it update
**So that** I can iterate to exactly what I want over multiple turns

### US-05: Resume an existing graphic's chat later

**As a** Creator
**I want** to reopen a previously created graphic and continue its chat history
**So that** I can keep refining a graphic any time without losing its lineage

### US-06: Confirm cost before generating

**As a** Creator
**I want** to see the estimated cost of a generation and confirm it before it runs
**So that** I am never surprised by spend on AI authoring or regeneration

### US-07: Use a Motion Graphic in a storyboard

**As a** Creator
**I want** to attach one of my Motion Graphics to a storyboard block as media
**So that** its animation appears in my video alongside images, video, and audio

### US-08: Duplicate a graphic to reuse with different content

**As a** Creator
**I want** to duplicate an existing graphic and edit the copy via chat
**So that** I can reuse the same look with different text across scenes

## 5. Acceptance criteria

### AC-01 (US-02) — happy path

**Given** an authenticated Creator on the AI Motion Graphic page who has set the desired animation length in the *animation duration (seconds)* input shown above the chat
**When** the Creator describes a graphic and confirms the generation
**Then** the system authors a Motion Graphic sized to that duration, records it under the Creator's account with an auto-generated title (which the Creator may rename) and the chosen fixed duration, and shows it ready to preview

### AC-02 (US-03) — happy path

**Given** a Creator who owns a successfully generated Motion Graphic
**When** the Creator opens the graphic
**Then** the system plays the graphic back in real time in a large preview region that fills the canvas area and shows its authoring chat alongside, with the animation-duration input above the chat

### AC-03 (US-04) — happy path

**Given** a Creator viewing one of their Motion Graphics
**When** the Creator sends a refinement instruction in the chat and confirms it
**Then** the system updates the graphic, appends the exchange to the persistent chat history, and the refreshed graphic is shown in the live preview

### AC-04 (US-07) — happy path

**Given** a Creator who owns a ready Motion Graphic and is editing a storyboard
**When** the Creator attaches the graphic to a storyboard block as media
**Then** the system records a snapshot of the graphic's current code and duration on that block and shows it among the block's media

### AC-05 (US-02) — error / invalid input

**Given** an authenticated Creator on the AI Motion Graphic page
**When** the Creator submits a description that is empty or shorter than the minimum length the system requires for a meaningful prompt
**Then** the system declines to start the generation and explains in plain language that a longer, meaningful description is required

### AC-06 (US-02) — error / generation cannot produce a usable graphic

**Given** a Creator whose confirmed generation produced a graphic that fails to run in the live preview or fails the deterministic-render rule (AC-09)
**When** the system finishes processing that attempt
**Then** the system marks the graphic as not usable, explains that the attempt did not produce a working graphic, and lets the Creator retry or refine rather than presenting a broken preview (reaching ready state requires both running in the live preview and meeting the deterministic-render rule)

### AC-07 (US-05) — authorization

**Given** a Creator who is not the owner of a particular Motion Graphic
**When** that Creator attempts to open, preview, continue the chat of, attach, duplicate, or otherwise act on that graphic through any surface
**Then** the system denies access uniformly — responding as though the graphic does not exist — and never reveals its existence or content on any surface, because graphics are private to their owner

### AC-08 (US-07) — domain invariant (ready-state)

**Given** a Creator who owns a Motion Graphic that is still generating or was marked not usable
**When** the Creator attempts to attach it to a storyboard block
**Then** the system blocks the attachment and tells the Creator that only a ready, working graphic can be used

### AC-09 (US-02) — domain invariant (deterministic render)

**Given** a Creator generating or refining a Motion Graphic
**When** the authored graphic would animate from wall-clock time or randomness rather than from its frame position
**Then** the system treats the graphic as not meeting the deterministic-render rule and does not present it as ready, so that the live preview and the final export are guaranteed to match

### AC-10 (US-07) — cross-context (snapshot isolation)

**Given** a Creator who has attached a Motion Graphic to a storyboard block and later refines that source graphic in its chat
**When** the Creator returns to the storyboard
**Then** the already-attached instance is unchanged from its snapshot, because placed instances are frozen at insertion and are not retroactively altered by source edits

### AC-11 (US-06) — error / cost-guard

**Given** a Creator who is shown an estimated cost for a generation
**When** the request proceeds with a cost that the system's independent server-side re-computation does not confirm under the same match rule the existing cost-estimate + confirm service already applies
**Then** the system refuses to run the generation and explains that the shown estimate could not be confirmed

### AC-12 (US-08) — happy path

**Given** a Creator who owns a Motion Graphic
**When** the Creator duplicates it
**Then** the system creates an independent copy owned by the same Creator, seeded with the original's chat history as live, re-runnable turns (not a frozen transcript) plus its current code, that can be refined further without affecting the original

### AC-13 (US-01) — happy path

**Given** an authenticated Creator who has previously created Motion Graphics
**When** the Creator opens the AI Motion Graphic page
**Then** the system lists only the graphics owned by that Creator, each with its title and duration, and shows an empty state when there are none

### AC-14 (US-04) — error / refinement produces a broken result

**Given** a Creator refining a ready Motion Graphic whose new refinement produces code that fails to run or fails the deterministic-render rule (AC-09)
**When** the system finishes processing that refinement
**Then** the system keeps the last working version as the graphic's current ready state, records the failed attempt in the persistent chat history with a plain-language error, and does not overwrite or break the previously working graphic

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95 — live preview ready after code change | ≤ 1500 ms from code received (including transpile + sandbox/runtime init) to first rendered frame | client preview-render timing metric |
| Latency p95 — Motion Graphics list load | ≤ 400 ms | server list-endpoint metric |
| Time-to-first-streamed-token on a generation/refinement | ≤ 3 s p95 | chat streaming metric |
| Render parity (preview vs future server export) | Every ready graphic obeys the deterministic-render rule (AC-09); parity is verified by a frame-diff check in CI on a fixed fixture set — there is no per-user-graphic runtime frame-diff | CI frame-diff on the fixture set + deterministic-render rule enforcement |
| Malicious-prompt guardrail | ≥ 95% of a curated red-team prompt set (exfiltration / system-subversion intent) are refused before generation runs | guardrail conformance test suite over the red-team prompt set |

## 6.1 Security / privacy

- **Data classification:** confidential — a Motion Graphic is the Creator's content **and** executable code; chat history may contain proprietary creative direction.
- **Personal data touched:** none new beyond existing account ownership; no new PII fields. Graphics and chats are owned per-account.
- **AuthZ/AuthN impact:** authenticated Creators only; every read/write of a Motion Graphic, its chat, and its storyboard attachments is filtered by the owning account. No cross-account access path exists in MVP1. New capability: authoring and executing code-backed graphics in the browser (server-side execution deferred). Code is produced only via AI prompts — there is no hand-written-code entry point.
- **Abuse cases:**
  - **Browser code exfiltration / XSS:** AI-authored (or prompt-injected) code attempts to read the session, cookies, or beacon data to an external host during preview → MVP1 does **not** sandbox browser execution; the mitigation is two-fold: (a) the code runs only in its own author's browser session and graphics are never shared, so the blast radius is self-only — an author can only reach their own session, never another account — and (b) a prompt-guardrail refuses prompts whose intent is exfiltration or system subversion. **Residual risk (accepted for MVP1):** an author who defeats the guardrail can exfiltrate their own session — self-inflicted only, no cross-account harm.
  - **Server-side RCE / SSRF at export:** **out of MVP1 scope** — MVP1 does not execute graphic code server-side. This risk re-enters when the server-side export milestone is built; its isolation mechanism is tracked in §8 (OQ-1) and is a precondition of that milestone, not of the MVP1 release.
  - **Resource-exhaustion DoS:** code with infinite loops or huge allocations → MVP1 runs no shared render fleet, so a runaway graphic can only freeze its own author's browser tab (self-only); the export queue is not exposed in MVP1.
  - **Cost-estimate manipulation:** a tampered client estimate tries to run a costly generation cheaply → server re-validates the estimate and refuses on mismatch (instrument-only, no ledger).
  - **Non-deterministic render abuse / drift:** time/random-driven code makes a future export diverge from the approved preview → the deterministic-render rule blocks the graphic from reaching ready state.
- **Security review:** **Required** — this feature introduces a new trust boundary (executing untrusted, AI-authored code in the browser with no execution sandbox, relying on a prompt-guardrail plus a self-only blast radius from per-Creator, no-sharing scope).

## 7. Metrics / KPIs

- **Adoption — projects using a Motion Graphic** — baseline: 0, target: ≥ 30% of new projects (projects *created after the feature launch date*) contain at least one attached Motion Graphic within 60 days of launch.
- **Generation success rate** — baseline: 0 (new), target: ≥ 80% of confirmed generations produce a graphic that reaches ready state (runs in preview) within 90 days.
- **Time-to-first-usable-graphic** — baseline: TBD (measure during beta from first prompt to first graphic reaching ready state), target: median ≤ 3 minutes within 90 days. Measurement plan: instrument prompt-submit → ready-state timestamps in beta.
- **Reuse rate per graphic** — baseline: 1.0 (created = used once), target: ≥ 1.8 average insertions per created graphic within 120 days.
- **Cost estimate↔actual delta** — baseline: 0, target: |median delta| ≤ 15% between shown estimate and actual generation cost, reusing the existing delta metric.

## 8. Open questions

- [ ] What is the isolation mechanism for executing AI-authored code **server-side at export** with no secret/filesystem/internal-network reach? **Deferred out of MVP1** — server-side execution is not built in MVP1; this must be answered (with an ADR) as a precondition of the future server-side export milestone, not for the MVP1 release. Default then: treat all generated code as untrusted and isolate server execution. — owner: Tech Lead + Security Lead, due: before the server-export milestone is scheduled (post-MVP1)
- [ ] What is the allowed import/runtime surface for generated code in the browser (which modules/APIs may a graphic use), and what does the prompt-guardrail treat as out-of-bounds? Default now: a minimal allowlist (rendering runtime + schema lib only), reject anything else at authoring time. — owner: Tech Lead, due: before sdd:tasks (ADR)
- [ ] How is asset-rot handled when the underlying rendering runtime version changes and older saved graphics may stop rendering — and is an attached snapshot re-validated against the pinned runtime at attach time? Default now: pin the runtime version, snapshot at attach without re-validation, and accept that re-validation/migration of old graphics is a later concern. — owner: Tech Lead, due: before sdd:design completes
- [ ] What is the curated red-team prompt set and the rejection threshold for the malicious-prompt guardrail (§6 NFR)? Default now: ≥ 95% rejection over a Security-Lead-owned red-team set. — owner: Security Lead, due: before sdd:plan-tests
- [x] *(resolved 2026-06-17)* How is preview↔export frame parity enforced? → the deterministic-render rule (AC-09) on every graphic + a CI frame-diff on a fixed fixture set; **no** per-user-graphic runtime frame-diff (§6 NFR).
