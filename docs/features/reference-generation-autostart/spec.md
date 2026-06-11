---
status: Draft
owner: "Oleksii (Storyboard squad)"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-11"
feature_size: "S"
---

# Spec — reference-generation-autostart

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** `docs/architecture-map.md`; the predecessor features [storyboard-reference-flows](../storyboard-reference-flows/) (Cast extraction / Cast confirmation / Cost confirmation contract) and [scene-generation-reference-gate](../scene-generation-reference-gate/) (the downstream gate that consumes reference outputs); the current Step-2 page + cast flow components `apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx`, `CanvasToolbar.tsx`, `CastConfirmModal.tsx` (read for the existing manual-start + modal-render behaviour this feature changes).

## 1. Context

¶1 **What we're solving.** A Creator who reaches the Video Road Map (Step 2) of a storyboard draft today has to manually start reference generation: click "Start reference generation" in the canvas toolbar, then act again inside a surface that — in its not-yet-proposed state — renders **two unstyled buttons at the bottom of the page** instead of a real modal (the *stray-buttons defect*). The result is two friction points on the path to a usable draft: an extra manual step that the Creator must remember to take, and a broken-looking surface that reads as a layout glitch rather than a dialog.

¶2 **Why now.** The per-cast reference flows shipped (`storyboard-reference-flows`, 2026-06-07) and the Reference-done gate that consumes their outputs shipped (`scene-generation-reference-gate`, 2026-06-10). Reference generation is now the load-bearing first thing a Creator needs on Step 2, so the manual-kickoff friction and the broken modal are directly in the critical path of every storyboard — and worth removing before more flow is layered on top.

¶3 **The committed approach.** (a) **Auto-start** the **free** cast extraction the moment a Creator enters Step 2 for a draft that has no extraction yet — silently, once per entry, never re-running when one already exists — so the cast proposal is already in progress or ready when the Creator opens the modal. (b) Render the Cast confirmation surface as a **proper modal** (backdrop, centered container, dialog semantics) in every state, including the pre-proposal state, eliminating the stray-buttons defect. The aggregate **Cost confirmation** for the **paid** first generation is unchanged: nothing is charged without the Creator's explicit consent.

¶4 **Assumptions ledger (easy-depth — vetoable before `sdd:tasks`).**
- The manual "Start reference generation" toolbar control is **retained** as a re-trigger / recovery path (e.g. after a failed auto-start or a dismissed modal); auto-start does not remove it.
- Auto-start **does not auto-open** the Cast confirmation modal — extraction runs in the background and the Creator opens the modal when ready. (Open question OQ-2 if the owner prefers auto-open.)
- A failed auto-start does **not** auto-retry; the Creator recovers via the manual control. (OQ-1.)
- Auto-start is a **no-op** (no error, no toast) when the draft's Step-1 content gives cast extraction nothing to propose — same as today's empty-extraction outcome.
- The Cost-confirmation amount, credit math, and the downstream Reference-done gate are inherited unchanged — out of scope here.
- **"Entry" is per Step-2 open, guarded on persisted state (clarify 2026-06-11).** Each open/re-mount/re-focus of Step 2 checks whether the draft already has a cast extraction; auto-start fires only when none exists, so a re-mount before the first extraction is persisted is the only race (handled in `design`). Dedup keys on the draft's persisted extraction, not a session flag. (AC-01/AC-05.)
- **"Failed auto-start" = the extraction request was never accepted (clarify 2026-06-11)** — no cast extraction was created. A created-but-errored extraction is an *existing* extraction (AC-05 no-op), not a failed one; only the never-started case is recovered via the manual control. (AC-07.)
- **The manual "Start reference generation" control always opens the Cast confirmation modal (clarify 2026-06-11)** — in every entry case, not only after a failure — and never starts a second extraction when one already exists (it surfaces the existing one). (Glossary; AC-05/AC-07.)
- **Completed-but-empty extraction has a distinct modal state (clarify 2026-06-11):** the Cast confirmation modal shows a "nothing to generate references for" completed-empty state with a close action and no confirm — empty-complete counts as *ready*, not still-in-progress. (AC-03/AC-06.)
- **"page-ready" for the latency NFR = Step-2 mounted AND the existence check resolved (clarify 2026-06-11)**, with that check inside the 500 ms budget. (§6.)

## 2. Goals

- A Creator reaching Step 2 finds reference generation already underway without taking a manual action, removing the "remember to start it" step from the critical path.
- The Cast confirmation surface always presents as a real dialog — the stray-buttons defect can no longer occur in any state.
- The single point of paid consent is preserved: no credits are ever spent without the Creator's explicit Cost confirmation.

## 3. Non-goals

- Changing cast extraction's proposal logic or what it reads from Step 1 — this feature changes *when* it starts, not *what* it produces.
- Changing the Cost-confirmation amount, credit accounting, or the paid first-generation flow — untouched.
- Changing the downstream Reference-done gate or scene generation — they consume reference outputs exactly as before.
- Auto-confirming or auto-paying for reference generation — explicit Creator consent remains mandatory.

## 4. User stories

### US-01: Reference generation starts on Step-2 entry

**As a** Creator
**I want** the free cast extraction to start automatically when I enter Step 2 of a draft that has none yet
**So that** the cast proposal is already being prepared without me remembering to start it.

### US-02: See a real modal, never stray buttons

**As a** Creator
**I want** the Cast confirmation surface to always appear as a proper centered dialog
**So that** I never see two loose buttons at the bottom of the page that look like a layout bug.

### US-03: See extraction progress while it runs

**As a** Creator
**I want** the modal to show that the cast is still being prepared when I open it before the proposal is ready
**So that** I understand the system is working rather than thinking it is broken or empty.

### US-04: Keep control over paid generation

**As a** Creator
**I want** the auto-started extraction to stop short of spending credits until I confirm the cost
**So that** I am never charged for reference generation I did not approve.

### US-05: Recover when auto-start did not happen

**As a** Creator
**I want** a manual "Start reference generation" control to remain available
**So that** I can trigger or re-open the flow if auto-start failed or I dismissed the modal.

### US-06: Avoid duplicate extractions

**As a** Creator
**I want** entering Step 2 again to not launch a second cast extraction when one already exists
**So that** my draft is never left with conflicting or duplicated cast proposals.

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** an authorized Creator owns a draft that has Step-1 content to extract from and no cast extraction yet
**When** the Creator enters Step 2 (the Video Road Map)
**Then** the system starts the free cast extraction automatically and silently, without charging credits and without forcing any modal open, and the proposal becomes available to review when extraction completes.

### AC-02 (US-02) — error / no broken surface

**Given** an authorized Creator owns a draft whose cast extraction has not yet produced a proposal (still running or not started)
**When** the Cast confirmation modal is shown to the Creator
**Then** the system presents a proper centered dialog with a backdrop, and never renders loose action buttons inline in the page body.

### AC-03 (US-03) — progress visible

**Given** an authorized Creator owns a draft whose cast extraction is still running
**When** the Creator opens the Cast confirmation modal
**Then** the system shows that the cast is being prepared (in-progress state) and offers no confirm action until the proposal is ready — a *completed* extraction exits the in-progress state whether it proposed a cast or none (the completed-but-empty case is handled in AC-06).

### AC-04 (US-04) — authorization / consent before charge

**Given** an authorized Creator owns a draft whose cast extraction has finished and proposed a cast carrying an aggregate cost estimate
**When** the Creator has not yet confirmed the cost
**Then** the system has spent no credits and started no paid reference generation, and begins the paid first generation only after the Creator explicitly confirms the cost.

### AC-05 (US-06) — domain invariant: one extraction per draft

**Given** an authorized Creator owns a draft that already has a cast extraction (running or completed)
**When** the Creator opens Step 2 again — including any re-mount or re-focus of the page
**Then** on each open the system checks whether the draft already has a cast extraction and, finding one (running or completed), does not start a second — it passively keeps the existing extraction available for the Creator to open (it does not force the modal open) — honoring the "one cast extraction per draft" invariant.

### AC-06 (US-01) — cross-context: nothing to extract

**Given** an authorized Creator owns a draft whose Step-1 content yields no characters or environments to propose
**When** the Creator enters Step 2
**Then** the system completes the auto-started extraction with an empty proposal and shows no error, leaving the draft usable with no reference blocks; and when the Creator opens the Cast confirmation modal it presents a distinct completed-empty state ("nothing to generate references for") with a close action and no confirm — consistent with the existing zero-reference path.

### AC-07 (US-05) — error recovery

**Given** an authorized Creator owns a draft whose auto-start did not result in a cast extraction being created (the request was never accepted — a created-but-errored extraction counts as *existing*, not failed, per AC-05)
**When** the Creator uses the manual "Start reference generation" control
**Then** the system starts the cast extraction and opens the Cast confirmation modal — the manual control always opens the modal, in every entry case and not only after a failure — without having charged any credits for the failed attempt.

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Auto-start dispatch latency after Step-2 entry | ≤ 500 ms (p95) from page-ready to extraction request issued | front-end timing metric / RUM; **page-ready** = Step-2 page mounted AND the draft + cast-extraction-existence check resolved — the existence check is inside this budget |
| Cast confirmation modal first paint | ≤ 150 ms (p95) after open | front-end render metric |
| Duplicate-extraction rate | 0 second-extractions per draft from repeated Step-2 entries | extraction-job audit count per draft |
| Stray-buttons defect occurrences | 0 in any modal state | UI regression test + visual review |

## 6.1 Security / privacy

- **Data classification:** internal — storyboard draft content owned by a single Creator; no new data category introduced.
- **Personal data touched:** none new — auto-start reuses the existing cast-extraction inputs (the draft's own script/scene content).
- **AuthZ/AuthN impact:** none new — auto-start runs in the existing Creator-owns-draft context; only the draft owner can enter Step 2 of their draft and therefore trigger it. No new capability or permission boundary is added.
- **Abuse cases:**
  - cross-tenant trigger: a non-owner cannot enter another Creator's Step 2, so cannot auto-start their extraction — existing owner check denies it.
  - extraction spam via repeated entry: the once-per-draft / no-op-if-exists rule prevents repeated Step-2 entries from launching multiple extractions.
  - unintended charge: auto-start covers only the free extraction; the paid generation stays behind the explicit Cost confirmation, so no charge can be triggered without consent.
- **Security review:** N/A — no new authz boundary, no new PII, reuses the existing owner-scoped, free, non-charging extraction path.

## 7. Metrics / KPIs

- **Cast ready-on-open rate** — share of Step-2 sessions where the cast proposal is already running or ready by the time the Creator first opens the modal. Baseline: 0% (today extraction starts only on manual click), target: ≥ 80% within 14 days of release.
- **Stray-buttons defect rate** — occurrences of the no-proposal surface rendering loose inline buttons. Baseline: present (current bug), target: 0 immediately on release.
- **Manual starts before confirmation** — average number of manual "Start reference generation" clicks a Creator makes before confirming cost. Baseline: ≥ 1 (always required today), target: ≤ 0.2 within 14 days (manual path used only for recovery).

## 8. Open questions

- [ ] OQ-1: Should a failed auto-start retry automatically before falling back to the manual control? Default now: no auto-retry — Creator recovers manually (AC-07). — owner: Oleksii (Storyboard squad), due: before `sdd:tasks`
- [ ] OQ-2: Should the Cast confirmation modal auto-open once the proposal is ready, or stay closed until the Creator opens it? Default now: stay closed (background extraction, Creator opens on demand). — owner: PM, due: before `sdd:tasks`
- [ ] OQ-3: On a draft that already has *confirmed* reference blocks, should entering Step 2 still attempt anything, or is auto-start strictly for the no-extraction case? Default now: strictly no-op once any extraction exists (AC-05). — owner: Tech Lead, due: before `sdd:tasks`

## Test plan

> **Scope:** S feature, plan inline per size-matrix. Surfaces = `web-frontend` + `backend-service` (sad `target_surfaces`), so the levels in play are **unit**, **integration** (api against real MySQL), **component** (RTL/Testing Library), and **e2e-through-UI** (Playwright). No dedicated visual-regression tool exists in the repo → the stray-buttons defect is covered by a **component assertion** plus the spec's manual visual review (§6). Tools are detected by `implement` (vitest · @testing-library/react · @playwright/test · supertest); not hard-coded here.

### Coverage — every §5 AC maps to ≥1 named test

| AC | Test (named from intent) | Level(s) | Expected outcome |
|---|---|---|---|
| **AC-01** auto-start happy path | `useCastAutostart starts extraction on Step-2 entry when none exists` | component | On mount with existence-check → none, the hook issues exactly one start request; no modal forced open, no charge. |
| **AC-01** (end-to-end journey) | `entering Step 2 auto-starts extraction and the proposal becomes reviewable` | e2e-through-UI | Real UI: enter Step 2 → extraction starts silently → modal later shows the proposal. |
| **AC-02** real dialog, never stray buttons | `CastConfirmModal renders a backdrop+dialog in every state with zero inline action buttons` | component | In each state (pre-proposal, running, proposal-ready, completed-empty, failed) the surface exposes `role="dialog"` + backdrop and renders **no** loose buttons in the page body. Backstops QG-2 / NFR "stray-buttons = 0". |
| **AC-03** progress visible | `CastConfirmModal shows in-progress state and offers no confirm while extraction runs` | component | Open during `queued`/`running` → "cast is being prepared", confirm action absent until proposal ready. |
| **AC-04** consent before charge | `confirm cost starts the paid generation; nothing is charged before confirm` | integration · e2e-through-UI | api integration (real MySQL): no paid generation / no credit spend until `POST …/confirm`; only then is the paid first generation dispatched. e2e: review proposal → confirm → "generation underway". |
| **AC-05** one extraction per draft (ADR-0001) | `duplicate startExtraction returns the existing job and the row count for the draft stays at 1` | integration | **Key test (QG-3).** Real MySQL: two `startExtraction` calls for the same draft → second returns the existing job's `id`; `SELECT COUNT(*) … WHERE draft_id` = 1. Covers re-mount / concurrent-tab race. |
| **AC-05** client traffic-hygiene guard | `useCastAutostart in-flight guard suppresses the redundant start on re-mount` | component | A second mount while a start is in flight issues **no** second request (the latency/traffic optimization, not the correctness mechanism — that's the integration test above). |
| **AC-06** nothing to extract (completed-empty) | `CastConfirmModal shows the completed-empty state with close-only and no confirm` | component | Extraction completed with empty proposal → "nothing to generate references for", close action present, **no** confirm; no error surfaced. |
| **AC-06** empty extraction completes cleanly | `auto-started extraction with no characters completes empty without error` | integration | Real MySQL: empty-proposal completion leaves the draft usable, status `completed`, no reference blocks, no error row (reuses the existing extraction-service seam; asserts the auto-start path inherits it). |
| **AC-07** error recovery via manual control | `manual Start control opens the modal and starts extraction when auto-start created none` | component · e2e-through-UI | component: the manual control always opens the modal and (when no extraction exists) issues the start; a *failed* auto-start surfaces no toast (swallowed per §1¶4). e2e: failed auto-start → click manual → extraction starts + modal opens, no charge for the failed attempt. |

### Edge & error rows (called out, not folded into happy paths)

- **AC-02** broken-surface defect, **AC-06** completed-empty, and **AC-07** failed-auto-start recovery each have their **own** rows above — none folded into a happy path.
- **Silent failed auto-start:** asserted inside the AC-07 component test — a rejected/never-accepted start produces **no** error toast and leaves the draft recoverable via the manual control (spec §1¶4; sad §8 Error handling).
- **Concurrent / re-mount race:** the AC-05 integration test exercises the duplicate-call path (idempotent start); the AC-05 component test exercises the single-client in-flight guard — the two halves of the dedup invariant.

### Integration strategy — ephemeral real dependency, never mocked

- **Datastore:** the api integration suite runs against **real MySQL** (`singleFork: true`, datastore never mocked — architecture-map §Tests; existing `storyboardReference.extraction.service.test.ts` + `__tests__/integration/migration-052-055-references.integration.test.ts` are the precedent the AC-05 / AC-04 / AC-06 integration tests join).
- **Seed:** no new factory — insert `storyboard_cast_extraction_jobs` rows through the existing cast-extraction seam (`data-model.md §Test fixtures`); the duplicate-start test seeds one job then asserts the count stays at 1.
- **Cleanup boundary:** per the repo's existing integration convention (truncate/rollback per test in the single fork); leaving rows behind would make the count assertion flaky — cleanup is per-test.
- **PII guard:** any seeded owner uses `user-<uuid>@example.test`.

### Load

<!-- N/A: no numeric NFR carries a server throughput/concurrency target. The §6 numbers (auto-start dispatch ≤500 ms p95, modal first paint ≤150 ms p95) are front-end render/dispatch latencies — verified by instrumentation / RUM in production (§6 Measurement), not a load tool. The "duplicate-extraction rate = 0" NFR is verified by the AC-05 integration test; "stray-buttons = 0" by the AC-02 component test. -->

### NFR / QG verification (non-test, recorded for traceability)

| NFR / QG | How verified | Test row? |
|---|---|---|
| QG-1 auto-start dispatch ≤ 500 ms p95 | Front-end timing metric / RUM in prod (chosen: instrumentation only — p95 isn't representable in unit/component) | No automated test — instrument the dispatch timing |
| QG-2 modal first paint ≤ 150 ms p95 | Front-end render metric / RUM | No automated test — instrument render timing |
| Duplicate-extraction rate = 0 | **AC-05 integration test** (count stays 1) | Yes |
| Stray-buttons defect = 0 | **AC-02 component test** + manual visual review (§6) | Yes (component) |

### CI placement

- **Every PR (fast):** unit · component · api integration (the AC-01/02/03/05/06 component tests + AC-04/05/06 integration tests).
- **Scheduled / pre-release (heavier):** the three e2e-through-UI journeys (AC-01, AC-04, AC-07) — run off the PR critical path because the Playwright suite carries the seed-user + 15-min login rate-limit friction noted in the repo's gate realities. Split is advice; `implement` and the repo CI own the wiring.
