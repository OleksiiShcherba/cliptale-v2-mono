---
status: Draft
owner: "Product (PM) + Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-06"
feature_size: "L"
---

# Spec — storyboard-reference-flows

> **Glossary:** [CONTEXT](./CONTEXT.md) (inherits canonical terms of [generate-ai-flow/CONTEXT.md](../generate-ai-flow/CONTEXT.md))
> **Reference module / docs / channels used:** None — the interview + CONTEXT + `docs/architecture-map.md` + the existing behavior of the storyboard illustration pipeline and the generate-ai-flow feature (facts of the current system, not external sources).

## 1. Context

¶1 **What we're solving.** Today the storyboard's reference phase produces ONE principal image that the Creator approves in a modal; it then anchors the style of every scene illustration. One image cannot carry the identity of several characters and locations, so the same character drifts visually from scene to scene, and Creators burn paid scene regenerations chasing consistency. This feature replaces the single anchor with per-character and per-environment reference flows the Creator curates before any expensive scene generation. Target segment: Creators producing multi-scene narrative videos in the storyboard wizard.

¶2 **Why now.** The Generate AI Flows feature just shipped: node-canvas generation flows, result blocks, cost confirmation, and automatic library linkage already exist as rails. Competitive research shows no product on the market combines (a) AI-generated per-character/environment references, (b) script-driven auto-proposal of which cast entries need them, (c) a star-to-promote curation mechanic, and (d) per-scene linking back into the storyboard — adjacent tools either require manually uploaded references or offer label-only consistency. The gap is open and the rails are in place.

¶3 **The committed approach.** Build **«Confirm, Auto-Cast, Open-If-You-Care» with a manual star gate** (RICE ≈ 2.8: Reach 8/10 · Impact 3 · Confidence 70% · Effort ~6 pw; feasibility Tech ☑ Skills ☑ Time ☑, each anchored by an adjacent shipped feature; the multi-perspective matrix scored this approach the only one with no negative lens — UX: «low friction, depth on demand»; the competitive gap above is the differentiation claim). Cast extraction proposes the characters/environments, their reference-image assignments, and their scene links from the script; the Creator corrects and confirms the cast once (cast confirmation = one collective cost confirmation with an aggregate estimate); each entry becomes a reference block linked 1:1 to an auto-created, fully editable reference flow whose first generation auto-starts in a rolling concurrency window. The Creator stars the best results (primary star = block preview); scene-preview generation is gated until every reference block has ≥1 star, then the scene generation master picks references per scene strictly within the reference boundary.

¶4 **Traceability context.** This feature REPLACES the principal-image approval step (its UI is removed; existing drafts keep their data and switch to the new mechanism on their next reference-generation run). Reference blocks follow the placement precedent of music blocks (off-chain canvas blocks) but link to individual scenes instead of ranges. The collective cast confirmation is a **deliberate, scoped deviation** from the generate-ai-flow per-generate cost-confirmation rule: it covers only the first run of each auto-created flow; every later regeneration confirms per generate as usual. The cost-blowout risk of one collective confirmation is mitigated by the cast size limit (a named domain invariant) plus the rolling-window auto-start; the stall-gate risk of the star gate is mitigated by the gate always naming exactly which blocks are missing stars.

## 2. Goals

- Make every recurring character and environment look consistent across all scene previews of a draft — the reference that drives a scene is a curated, Creator-approved image, not a lucky prompt.
- Cut wasted paid generations: the cast and its references are reviewed and starred BEFORE the expensive scene-generation pass, so regeneration cycles happen on cheap single references, not on whole scene sets.
- Keep the default path automated (auto-cast, auto-links, one collective confirmation) while the full flow-canvas iteration depth stays one click away from the storyboard.

## 3. Non-goals

- **Not migrating existing drafts** — drafts generated under the principal-image flow keep their data untouched; the new mechanism applies only when reference generation is next run on a draft. Avoids a risky backfill and surprise blocks appearing on canvases.
- **Not building a separate Flow Overview gallery page** — stars live on the result blocks of the existing flow canvas; a side-by-side comparison gallery is a future enhancement.
- **Not auto-starring results** — the Creator's manual star is the quality gate, deliberately chosen over a faster happy path (fewer paid scene regenerations beats speed).
- **Not a cross-draft character library** — reusing a starred character in another draft is a separate future epic.
- **Not changing music blocks** — they keep their start/end scene-range model; individual scene links are exclusive to reference blocks.
- **Not Seedance 2 model support** — tracked as a separate feature (seedance2-video-models).
- **Not building a new reference-image upload UI** — cast extraction reads images the Creator already uploaded through the existing storyboard upload mechanism, which this feature leaves unchanged; it only assigns those images to cast entries.
- **Not re-running cast extraction after confirmation** — once a draft has reference blocks, the cast grows only via manual block addition (US-07); automatic re-extraction with merge of an existing cast is a future enhancement.

## 4. User stories

### US-01: Confirm proposed cast

**As a** Creator
**I want** the system to extract and propose the characters and environments of my script, with my uploaded reference images assigned to them
**So that** I can correct the cast before any paid generation starts

### US-02: Auto-create reference flows

**As a** Creator
**I want** each confirmed cast entry to become a reference block linked 1:1 to its own generation flow, with the first generation auto-started after one collective cost confirmation
**So that** all my references generate without per-flow clicking

### US-03: Iterate in the flow

**As a** Creator
**I want** to open the linked flow from its block (and return via a back button), iterating with the full flow toolset
**So that** I can refine a character or environment until satisfied

### US-04: Star the best results

**As a** Creator
**I want** to star one or more results in a reference flow, with the primary star shown as the block preview
**So that** I control which images represent and reference each cast entry

### US-05: Link blocks to individual scenes

**As a** Creator
**I want** AI-proposed links to specific scenes, correctable via a multi-select selector with a visible list
**So that** I control where each character or environment may appear

### US-06: Generate consistent scene previews

**As a** Creator
**I want** scene generation to wait until every reference block has a star, and then use the starred images of linked blocks per scene
**So that** my scenes look consistent

### US-07: Add a cast entry later

**As a** Creator
**I want** to manually add a reference block with a new empty linked flow and no auto-run
**So that** I can extend the cast after confirmation

### US-08: Safe lifecycle

**As a** Creator
**I want** flows to survive block deletion, and a warning when deleting a flow with a linked block
**So that** hours of iteration aren't lost by one click

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** a Creator owns a draft with a script and optionally uploaded reference images
**When** the Creator starts reference generation
**Then** the system runs cast extraction and presents the proposed cast (characters and environments, each with its description, assigned reference images, and proposed scene links — all correctable in place, including the scene links via the same multi-select scene selector as on blocks) for review, with an aggregate cost estimate — and starts no paid generation yet

### AC-01b (US-01) — edge (repeat run)

**Given** a draft that already has reference blocks (a confirmed cast)
**When** the Creator looks for the cast-extraction action
**Then** it is not offered — the cast is extended only by manually adding blocks (US-07); automatic re-extraction is out of scope (§3)

### AC-02 (US-01) — domain invariant (cast size limit)

**Given** a draft whose script mentions more candidate characters and environments than the cast size limit
**When** cast extraction proposes the cast
**Then** the proposal contains at most the limit, keeps the entries that appear in the most scenes (story relevance = scene-appearance count), and tells the Creator that the remainder can be added manually later

### AC-03 (US-02) — happy path

**Given** a Creator reviewed the proposed cast
**When** they confirm it (the collective cost confirmation)
**Then** the system creates one reference block per entry on the Video Road Map canvas (off-chain, like music blocks), each linked 1:1 to a new reference flow pre-filled with that entry's assigned reference images or text description, and auto-starts the first generation in each flow in a rolling window — generations start in cast order, at most the configured concurrency limit run at once (a Creator-configurable setting, default 4), and as soon as one finishes the next starts; the confirmation covers these first runs only

### AC-04 (US-02) — error (partial failure)

**Given** confirmed cast generation is running across several flows
**When** the first generation of some flows fails
**Then** each affected block shows a failed status with a retry action and a plain-language reason, other blocks continue unaffected, and the draft is never left without a clear per-block status; a block left with no results counts as missing a star for the star gate, and the gate message names it together with its exit actions — retry the generation or delete the block (AC-14)

### AC-05 (US-03) — happy path

**Given** a Creator is on the Video Road Map canvas with a reference block
**When** they open the block
**Then** the linked flow opens in the same tab with a visible «back to storyboard» action returning to this draft, and the flow is fully editable like any generation flow

### AC-06 (US-04) — happy path

**Given** a reference flow has completed results
**When** the Creator stars one or more results (and optionally designates the primary star)
**Then** all starred results become the block's reference candidates and the primary starred result appears as the block's preview on the storyboard canvas

### AC-07 (US-04) — edge (primary removed)

**Given** a reference block whose primary starred result exists
**When** the Creator un-stars it or deletes it from the flow
**Then** the block's preview falls back to another starred result if any, otherwise the block shows the no-preview placeholder and counts as missing a star for the star gate; the same rule applies when all starred results are removed or every result in the linked flow is deleted — the block↔flow link itself stays intact (the no-flow state applies only to a deleted flow, AC-12)

### AC-08 (US-06) — domain invariant (star gate)

**Given** a draft where at least one reference block has no starred result
**When** the Creator attempts to start generation of the draft's full scene-preview set
**Then** the system blocks the start and names, in plain language, exactly which blocks still need a starred result

### AC-08b (US-06) — edge (gate scope)

**Given** a draft whose previews exist (or whose cast is partially starred)
**When** the Creator regenerates an individual scene X, or the draft has no reference blocks at all
**Then** regenerating scene X requires starred results only from the blocks linked to X (unstarred blocks not linked to X don't block it); and a draft with zero reference blocks passes the gate — its scenes generate per the no-linked-blocks rule of AC-09, with the derived style description falling back to the script when no starred results exist

### AC-09 (US-06) — cross-context (reference boundary)

**Given** every reference block has at least one star and scene generation starts
**When** the scene generation master prepares scene X
**Then** it considers only the starred images of blocks linked to X as reference candidates (choosing among them as needed), never uses images of unlinked blocks for X, and generates scenes with no linked blocks from their prompt plus one draft-global derived style description (shared by all such scenes of the draft)

### AC-10 (US-05) — happy path

**Given** reference blocks were created with AI-proposed scene links
**When** the Creator opens a block's scene selector and adds or removes individual scenes
**Then** the block's visible linked-scenes list updates and the next scene generation respects the updated links

### AC-10b (US-05) — edge (scene lifecycle)

**Given** reference blocks with scene links exist
**When** the Creator deletes a scene, adds a new scene, or reorders scenes
**Then** deleting a scene automatically removes it from every block's linked-scenes list (no dangling links), a newly added scene receives no links automatically (the Creator adds them via the selector), and reordering changes no links — a link binds to the scene itself, not its position

### AC-11 (US-07) — happy path

**Given** a Creator on the storyboard canvas after cast confirmation
**When** they manually add a new reference block (character or environment)
**Then** the system creates an empty linked reference flow without starting any generation or charging anything, and the block participates in the star gate like any other; manual additions are not capped by the cast size limit (it bounds only the extraction proposal) — they remain bounded by the existing per-user creation rate limits

### AC-12 (US-08) — cross-context (flow list)

**Given** auto-created reference flows exist
**When** the Creator views their Generate AI flow list
**Then** these flows appear marked with their draft's badge; and when the Creator attempts to delete such a flow, the system warns that a storyboard block depends on it, and after confirmation the block enters the no-flow state (no preview, no candidates, fails the star gate until resolved)

### AC-13 (US-03) — authorization

**Given** a signed-in Creator who does not own the draft
**When** they attempt to view or change the draft's reference data — open its reference blocks or linked flows, star or un-star results, edit scene links, confirm a cast, or delete a block or flow
**Then** the system denies the action without revealing the contents, because drafts and flows are private to their owner

### AC-14 (US-08) — happy path (block deletion)

**Given** a reference block with a linked flow
**When** the Creator deletes the block from the storyboard canvas
**Then** the flow and all its results remain intact in the Generate AI list (the draft badge is removed), the block's scene links are removed, and the block no longer participates in the star gate

### AC-14b (US-08) — edge (draft deletion)

**Given** a draft with reference blocks and linked flows
**When** the Creator deletes the draft itself
**Then** every linked reference flow and its results remain intact in the Generate AI list with the draft badge removed — the same survival rule as block deletion, so hours of flow iteration are never lost with the draft

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95 — cast extraction (start → proposal shown) | ≤ 60 s | async job telemetry (same channel as the existing storyboard planning queue) |
| Latency p95 — Video Road Map canvas open with reference blocks | ≤ 1500 ms (up to 50 blocks total) | frontend performance metric (aligned with the generate-ai-flow NFR) |
| Staged auto-start | rolling window in cast order: at most N first generations run concurrently per draft, where N is a Creator-configurable setting (default 4); full cast (≤ the cast size limit) picked up by a worker — actually generating, not merely enqueued — ≤ 5 min after confirmation | worker queue metrics |
| Aggregate cost estimate accuracy | actual total within ±10% of the shown estimate | billing telemetry comparison |
| Availability | 99.9% (inherits the existing SLO) | monthly SLO window |
| Concurrency safety (stars / scene links) | edits are never silently lost; conflicting concurrent saves are rejected with a reload prompt | versioned-save conflict metric |

## 6.1 Security / privacy

- **Data classification:** confidential — user-generated media; uploaded reference images may depict real persons (faces).
- **Personal data touched:** no new personal-data fields; uploaded reference images and generated character images may contain faces and are stored under the existing user-scoped media rules.
- **AuthZ/AuthN impact:** all new capabilities are owner-scoped: cast extraction reads only the owner's draft; reference flows are owned by the draft's owner; block↔flow links never cross Creators. No new roles.
- **Abuse cases:**
  - Cross-tenant access to a reference flow or block: denied without revealing existence (consistent with flow privacy).
  - Cost abuse via giant casts: bounded by the cast size limit on the extraction proposal + one aggregate estimate before any charge + rolling-window starts; manually added blocks start no generation and are bounded by the existing per-user creation rate limits.
  - Prompt injection through script text into cast extraction: script content is treated as data, never as instructions to the extraction step; extraction output is constrained to the cast schema.
  - Spam-creating reference blocks/flows: bounded by the existing per-user creation and generation rate limits.
- **Security review:** Required — feature size L and a new cross-feature authorization surface (storyboard ↔ flows).

## 7. Metrics / KPIs

- **Scene regenerations per completed draft** — baseline: TBD (measure for 2 weeks pre-release from scene-illustration job telemetry), target: −30% within 30 days post-release.
- **Cast-to-previews funnel** (drafts that confirmed a cast → drafts reaching a full scene-preview set) — baseline: TBD (same 2-week pre-release measurement on the principal-image flow), target: ≥ baseline within 30 days (the star gate must not create drop-off).
- **Reference utilization** — ≥ 80% of scenes that have ≥1 linked block actually receive starred-image references at generation time, within 30 days; baseline 0 (new metric).
- **Depth usage** — ≥ 30% of drafts with a confirmed cast have ≥1 manual flow iteration beyond the auto-started generation, within 60 days; baseline 0 (new metric).

## 8. Open questions

- [x] Exact cast size limit value? **Resolved (design, 2026-06-06): 12 (characters + environments combined)** — inline decision, sad.md §4. — owner: PM (Oleksii), due: before sdd:design
- [x] Refund/retry policy for charged-but-failed first generations after the collective confirmation? **Resolved (design, 2026-06-06): per-run charging at start; failed runs follow the existing per-run retry with a new charge** — ADR-0004. — owner: PM, due: before sdd:design
- [x] Draft duplication & checkpoint-restore semantics for block↔flow pairs? **Resolved (design, 2026-06-06): duplication unlinks (copied blocks enter the no-flow state); checkpoint restore re-validates links and marks missing flows as no-flow** — ADR-0006. — owner: Tech Lead, due: before sdd:design
- [x] How is the derived style description for unlinked scenes produced? **Resolved (design, 2026-06-06): derived from the set of starred results at scene-generation time; falls back to the script when no starred results exist** — ADR-0007. — owner: PM, due: before sdd:design
- [x] Selection rule/cap for reference candidates in the scene generation master? **Resolved (design, 2026-06-06): the primary starred result of each linked block, topped up with further stars to the model's reference capacity** — ADR-0008. — owner: Tech Lead, due: before sdd:design
