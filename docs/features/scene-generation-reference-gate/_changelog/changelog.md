# Changelog — scene-generation-reference-gate

## scene-generation-reference-gate — Reference-done gate replaces the star gate; principal image retired

**What:** Scene generation now starts only when every character/environment reference block **has finished generating** — the **Reference-done gate**. Starring no longer gates anything: it only *selects which* output of a ready block feeds scenes (no star → deterministic default: the latest completed output; a stale/unusable star falls back to that default, never to an empty reference). A per-scene regeneration is gated only on the blocks linked to that scene, so an unrelated unfinished reference never blocks it. A draft with **zero** reference blocks generates from prompts + style description alone; a draft with *any* reference block requires every scene to be linked, and the start is otherwise refused naming the unlinked scenes. The legacy **principal image** is fully retired from the scene path: no generation, no approval step, no UI step — any pre-existing record is ignored on read.

**Why:** Starring was a curation chore that didn't guarantee a reference actually *exists*, and the single principal image couldn't keep multiple characters/environments consistent across scenes — Creators got visual drift plus a confusing two-track readiness model. With per-cast reference flows shipped (`storyboard-reference-flows`, 2026-06-07), the genuine precondition is "references finished generating". See [spec](../spec.md) §1–§2. Load-bearing decisions:
- [ADR-0001](../adr/0001-target-backend-web-and-worker-surfaces.md) — change lands across api / web-frontend / media-worker surfaces.
- [ADR-0002](../adr/0002-gate-on-persisted-reference-output-existence.md) — readiness is the **persisted output-existence read** (≥1 completed `flow_files` output), not `window_status` and not a completion-event subscription — so manual blocks and unstarred-but-finished blocks can never deadlock the gate (AC-07).
- [ADR-0003](../adr/0003-feed-each-linked-block-a-single-selected-reference-output.md) — each linked block contributes exactly **one selected output** to a scene (star if usable, else latest completed), preserving the Reference-boundary invariant unchanged.
- [ADR-0004](../adr/0004-retire-principal-image-by-ignoring-it-on-read.md) — principal image retired by **ignore-on-read**; the row-level `DROP` is deferred (see operational notes).

**How to use:** Same start surface, revised contract (see [openapi.yaml](../contracts/openapi.yaml)):
- `POST /storyboards/{draftId}/illustrations` (full draft) — `202` when the gate passes; `422` with `references.reference_gate_failed` naming each blocking block (with finish/retry/remove guidance), or `references.unlinked_scenes` naming each unlinked scene. The predecessor's `references.star_gate_failed` is retired.
- `POST .../illustrations/blocks/{blockId}` (per-scene regenerate) — same `422 references.reference_gate_failed`, scoped to that scene's linked blocks only.
- `GET .../illustrations` — principal-image fields removed (breaking for any consumer that still read them).
- The four `.../illustrations/principal-image/*` routes are **deleted** (documented `deprecated` in the contract; calls now 404). The UI renders the gate rejection inline with named blocks/scenes and per-block retry controls.

**Operational notes:**
- Migrations: **none applied on deploy** — the feature is behaviour-only (ignore-on-read). The `DROP TABLE storyboard_illustration_references` pair is **staged, not promoted**, under [`migrations/_deferred/`](../migrations/_deferred/); promote it separately only after the KPI window confirms `principal-image generations = 0` for 7 days post-rollout ([data-model.md](../data-model.md)).
- Feature flag / config: none.
- Rollback: revert the deploy — no migration to back out. Legacy principal-image rows are untouched (ignored on read), so the previous build resumes reading them as before.
- Known limitations (accepted, spec §8): a reference job lost mid-generation keeps the gate closed until the Creator deletes or re-runs that block (no reaper); the gate is evaluated **once per start** — outputs added/deleted mid-pass are picked up only by the next start/regeneration.

**Acceptance criteria delivered:** AC-01, AC-02, AC-03, AC-03b, AC-04, AC-04b, AC-05, AC-06, AC-06b, AC-07, AC-08, AC-09 — traced end-to-end across api / media-worker / web-editor / e2e; review 2026-06-10 (F1–F7) + re-review fix-pass ([_review/review-2026-06-10-rereview.md](../_review/review-2026-06-10-rereview.md) — PASS).
