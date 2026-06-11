# Changelog — reference-generation-autostart

## reference-generation-autostart — Step-2 cast extraction now auto-starts, and the cast surface is a real dialog

**What:** A Creator who opens the Video Road Map (Step 2) of a draft that has no cast extraction yet now has the **free** cast extraction kicked off automatically in the background — no "Start reference generation" click required — so the cast proposal is already in progress or ready when they open the modal. The Cast confirmation surface now renders as a **proper centered dialog** (backdrop + dialog semantics) in every state, eliminating the *stray-buttons defect* where the pre-proposal state showed two unstyled buttons at the bottom of the page. Distinct modal states exist for in-progress, proposal-ready, and completed-but-empty.

**Why:** Reference generation is the load-bearing first step on Step 2 since the per-cast flows ([storyboard-reference-flows](../storyboard-reference-flows/), 2026-06-07) and the Reference-done gate ([scene-generation-reference-gate](../scene-generation-reference-gate/), 2026-06-10) shipped. The manual-kickoff friction and the broken-looking modal sat directly in the critical path of every storyboard. See [spec](./spec.md) §1–§2. The one load-bearing decision: [ADR-0001](./adr/0001-idempotent-cast-extraction-start.md) — `startExtraction` is now **idempotent per draft** (returns the existing job instead of inserting a duplicate), so repeated Step-2 entries / StrictMode double-mounts / multiple tabs cannot create a second extraction.

**How to use:** No new endpoint. Auto-start reuses the existing `POST /storyboards/:id/references/extraction` ([openapi.yaml](./contracts/openapi.yaml)); the frontend `useCastAutostart` hook performs a mount-time existence check and conditionally POSTs only when no extraction exists. The manual "Start reference generation" toolbar control is retained as a recovery path — it always opens the Cast confirmation modal and never starts a second extraction. Paid first generation still requires the Creator's explicit Cost confirmation; nothing is charged on the auto-start path.

**Operational notes:**
- Migration: <!-- none — purely behavioral (idempotency logic + UI rendering); no schema change -->
- Feature flag / config: <!-- none -->
- Rollback: revert the feature branch / deploy. No data migration to reverse. The idempotency check is read-before-insert against existing extraction rows, so reverting simply restores the prior duplicate-creating behavior — no orphaned state.

**Acceptance criteria delivered:**
- AC-01 — free cast extraction auto-starts on Step-2 entry when none exists.
- AC-02 — Cast confirmation surface is a real dialog in every state; 0 stray buttons.
- AC-03 — extraction progress is visible without a confirm action.
- AC-04 — paid generation charged only after explicit Cost confirmation (single consent point preserved).
- AC-05 — exactly one extraction per draft across repeated entries (ADR-0001 idempotent start, asserted against real MySQL — QG-3).
- AC-06 — completed-but-empty extraction shows a distinct "nothing to generate" state with close-only.
- AC-07 — a never-started (failed) auto-start is recoverable via the manual control, which queues a fresh extraction.
