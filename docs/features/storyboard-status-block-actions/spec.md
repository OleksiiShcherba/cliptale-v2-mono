---
status: Draft
owner: "Steven Hayes (PM)"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-05-30"
feature_size: "S"
---

# Spec — storyboard-status-block-actions

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** existing storyboard Step-2 status blocks (`apps/web-editor/src/features/storyboard/components/StoryboardPlanControls.tsx`) and `docs/architecture-map.md`; plus the interview + CONTEXT. No external channels read.

## 1. Context

When a Creator builds a storyboard draft, two status blocks appear in the top-left of the canvas: **"Generated scenes applied"** once the AI scene plan is applied, and **"Illustrations ready"** once scene images finish. Today these blocks are terminal — they show a "Done" badge and nothing more. A Creator who wants a different result has no in-place way to re-run generation, and cannot dismiss a block once it has served its purpose. The "Illustrations ready" block additionally shows a small black "Ref" reference-thumbnail box that looks inconsistent with its sibling and adds visual noise once illustrations are done.

The trigger is usability friction reported during storyboard editing: Creators expect to act on a completed status block (re-run it or get it out of the way) the way they would with any modern editor's status chip, and the two blocks should look and behave consistently. This is a small, self-contained UI adjustment to existing controls — no new backend.

The committed approach: give each **completed status block** a kebab (⋮) **status menu** — revealed on pointer hover or keyboard focus of the block, and kept in the tab order so it is reachable without a pointer — with two actions: **Regenerate** (re-runs the underlying generation) and **Hide** (removes the block for the current session). "Generated scenes applied" Regenerate is destructive (it overwrites the canvas), so it is gated by a **single confirmation dialog** that enumerates the present losses (whichever of scenes, illustrations, and music currently exist); "Illustrations ready" Regenerate is additive (it produces fresh images without deleting previously generated files, and needs **no confirmation step**). The "Illustrations ready" block drops its "Ref" box so it matches "Generated scenes applied" exactly.

The menu is offered **only on the completed state** of each block — never while generation is in progress or after a failure (those states keep their existing copy and controls), which keeps a Creator from hiding an in-flight or failed status or re-running a job that is already running. If a Regenerate itself fails, the block falls through to its existing **failed** state — the legacy copy and Retry control, with no status menu — and canvas integrity on a mid-run failure follows the unchanged existing generation behavior.

## 2. Goals

- Let a Creator re-run scene-plan generation or illustration generation directly from its completed status block, with the right safety for each (destructive vs. additive).
- Let a Creator dismiss a completed status block from the canvas when it is no longer useful.
- Make the two completed status blocks visually and behaviorally consistent (same menu, no stray "Ref" box).

## 3. Non-goals

- **Persisting the hidden state** — Hide is session-only; a hidden block returns on reload, or when that block re-enters a new generation cycle. (Persistence would add backend scope not justified now.)
- **Changing in-progress or failed status blocks** — their copy, reference preview, and retry controls are unchanged; only the completed state gains the menu. (Avoids hiding genuine failure/loading information.)
- **Per-scene illustration regeneration from the status block** — single-scene retry already lives on each scene block; the status-block Regenerate operates at the whole-draft level. (Keeps the menu simple.)
- **Cleaning up superseded illustration files** — old generated image files are retained, not deleted. (Storage cleanup is a separate concern.)

## 4. User stories

### US-01: Regenerate applied scenes

**As a** Creator
**I want** to re-run scene generation from the "Generated scenes applied" block
**So that** I can get a different storyboard without leaving the canvas

### US-02: Be warned before scenes are overwritten

**As a** Creator
**I want** a clear warning of exactly what I will lose before scenes regenerate
**So that** I do not accidentally discard scenes, illustrations, or music

### US-03: Regenerate illustrations non-destructively

**As a** Creator
**I want** to re-run illustration generation from the "Illustrations ready" block
**So that** I get fresh scene images while the previously generated image files are retained (the visible image on each scene is replaced; the older files are not deleted)

### US-04: Hide a completed status block

**As a** Creator
**I want** to hide a completed status block from the canvas
**So that** I can clear top-left clutter while I keep working

### US-05: Consistent completed blocks

**As a** Creator
**I want** "Illustrations ready" to look like "Generated scenes applied" with no extra "Ref" box
**So that** the two completed blocks read as one consistent control

### US-06: Act only on finished work

**As a** Creator
**I want** the Regenerate and Hide actions to be available only once a block has finished
**So that** I cannot accidentally hide or re-trigger generation that is still running or has failed

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** a Creator viewing their storyboard draft whose scene plan has finished and shows "Generated scenes applied"
**When** the Creator opens the status menu, chooses Regenerate, and confirms the warning
**Then** the block immediately leaves its completed state (the status menu disappears at once) and re-runs scene generation, showing the same in-progress UI as a first-time run

### AC-02 (US-04) — happy path

**Given** a Creator viewing a completed status block
**When** the Creator opens the status menu and chooses Hide
**Then** that block alone is removed from the top-left and the sibling block, if shown, is not hidden and reflows up into the freed space; there is no in-session un-hide affordance, and the block stays hidden until either the page is reloaded or that block re-enters a new generation cycle — which re-creates and re-shows it, including when the cycle is driven indirectly (e.g. a scene Regenerate that rebuilds the canvas and starts a fresh illustration run re-shows a previously hidden "Illustrations ready" block); the Creator can continue editing

### AC-03 (US-03) — happy path

**Given** a Creator viewing their draft where every scene already has an illustration and the block shows "Illustrations ready"
**When** the Creator opens the status menu and chooses Regenerate (no confirmation step — illustration Regenerate is additive)
**Then** the block immediately leaves its completed state (the status menu disappears at once) and the system generates fresh illustrations for the scenes, replacing the image shown on each scene block while the previously generated image files are retained (not removed), showing the same in-progress UI as a first-time run

### AC-04 (US-05) — happy path

**Given** a Creator viewing a draft whose illustrations have finished
**When** the "Illustrations ready" block is shown
**Then** it appears in the same visual style as "Generated scenes applied" with the same status menu and no "Ref" thumbnail box; the "Ref"-box removal and visual-consistency styling apply to every viewer of the draft regardless of ownership (only the kebab status menu itself is owner-gated, per AC-09)

### AC-05 (US-02) — error / accidental-action prevention

**Given** a Creator who has opened the warning before regenerating scenes
**When** the Creator cancels or dismisses the warning
**Then** no regeneration runs and the existing scenes, illustrations, and music remain untouched

### AC-06 (US-06) — state-based availability

**Given** a Creator whose scene-plan or illustration generation is still in progress or has failed
**When** the Creator views that status block
**Then** the status menu is not available on it, so Regenerate and Hide cannot be triggered until the block reaches its completed state

### AC-07 (US-01) — domain invariant violation (single generation per draft)

**Given** a Creator who triggers Regenerate on a completed status block
**When** the Creator activates Regenerate rapidly or more than once before the block leaves its completed state
**Then** the system starts exactly one generation for the draft, never two concurrent — because choosing Regenerate immediately moves the block out of its completed state (removing the status menu), so the duplicate trigger has no menu to act on

### AC-08 (US-02) — cross-context rule (downstream work)

**Given** a Creator whose draft has scenes with attached illustrations and music
**When** the Creator confirms Regenerate on "Generated scenes applied"
**Then** a single confirmation dialog has enumerated whichever of the current scenes, illustrations, and music presently exist as the items that will be replaced (categories absent from the draft are omitted), and on confirmation the canvas is rebuilt from the new scene plan — which discards any in-place edits to those scenes as an inherent consequence of the rebuild

### AC-09 (US-04) — authorization

**Given** a signed-in user who is not the Creator (owner) of a storyboard draft
**When** that user views the draft's completed status blocks
**Then** the kebab (⋮) status menu is not rendered at all on those blocks — neither Regenerate nor Hide is exposed — so both actions are reserved for the draft's Creator

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Status menu open latency | ≤ 100 ms from activation to menu content visible | manual UX check / interaction profiling (non-gating — not asserted as a CI pass/fail check; pure client render) |
| Destructive-action safety | 100% of scene-Regenerate triggers show the warning before any overwrite | E2E test asserts warning precedes regeneration |
| Accessibility | Status menu is keyboard-reachable and operable (focus + activate + Escape to close) | axe/keyboard-nav check in E2E |
| No generation-latency regression | Regenerate reuses the existing generation-start path; this feature owns no new generation-timing budget | confirmed by code review that Regenerate calls the unchanged start path (no new perf test owned here) |

## 6.1 Security / privacy

- **Data classification:** internal — storyboard draft content owned by the Creator; no new data is introduced by this feature.
- **Personal data touched:** none. No new fields; Hide state is session-only and not persisted.
- **AuthZ/AuthN impact:** no new authorization boundary. Regenerate reuses the existing draft-ownership rule — the underlying generation already enforces that only the draft's owner can run it. Hide is purely session-local client state and adds no server boundary; it is not separately authorized but is simply unreachable for non-owners because the whole kebab status menu (which hosts both actions) is **not rendered** for a non-owner (AC-09). The UI must not expose either action to non-owners.
- **Abuse cases:**
  - Accidental destructive Regenerate on scenes: mitigated by a mandatory warning that enumerates what is lost (US-02 / AC-05 / AC-08).
  - Regenerate spam / repeated triggers inflating generation cost: prevented by not starting a second generation while one is running (AC-07), and the menu being absent during in-progress states (AC-06).
  - Non-owner triggering generation on someone else's draft: denied — actions reserved for the owner (AC-09), enforced by the existing ownership check.
- **Security review:** N/A — frontend-only change reusing existing draft-ownership enforcement; no new interface, data, or authz boundary.

## 7. Metrics / KPIs

- **Accidental scene-loss recoveries** — count of version/history restores within 5 minutes of a scene Regenerate. baseline: 0 (no in-place regenerate exists today), target: ≤ 2% of scene-Regenerate events within 30 days.
- **Status-menu adoption** — share of completed-block sessions where a Creator opens the status menu. baseline: 0, target: ≥ 20% within 30 days.
- **"Where did my scenes go" support contacts** — storyboard-loss support contacts per month. baseline: capture the current monthly count in the two weeks before launch (owner: Steven Hayes, PM), target: no increase after launch despite the new destructive action.
- **Illustration Regenerate usage** — count of illustration Regenerate actions per active draft. baseline: 0, target: tracked (directional adoption signal), reviewed at 30 days.

## 8. Open questions

- [ ] When a Creator Regenerates illustrations (re-run all scenes), should the principal-image / visual-style approval gate re-trigger, and is it acceptable that scenes the Creator was happy with may receive different images (style drift)? Default now: re-run all scenes as the Creator chose; surface any re-approval as it works today. — owner: Steven Hayes (PM), due: before sdd:tasks
- [ ] Should superseded illustration files be cleaned up later, given Regenerate retains old files in storage indefinitely? Default now: keep them, no cleanup. — owner: Tech Lead, due: follow-up after launch
- [ ] How should a Regenerate that races a pending autosave or a second open tab behave (last-write-wins today)? Default now: accept current behavior. — owner: Tech Lead, due: sdd:design
