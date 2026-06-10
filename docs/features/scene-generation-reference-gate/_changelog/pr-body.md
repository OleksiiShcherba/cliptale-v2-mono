## Summary

Replaces the star gate with a **Reference-done gate**: scene generation starts only when every character/environment reference block has ≥1 persisted completed output; starring now only *selects which* output feeds a scene (default: latest completed). The legacy **principal image** is fully retired from the scene path (routes deleted, UI step removed, records ignored on read). Spec: [docs/features/scene-generation-reference-gate/spec.md](docs/features/scene-generation-reference-gate/spec.md).

## Acceptance criteria

- AC-01 — full-draft start succeeds when every reference block is ready; scenes draw on selected outputs of their linked blocks ✓
- AC-02 — not-ready references reject the start (422 `references.reference_gate_failed`), naming each blocking block with finish/retry/remove guidance ✓
- AC-03 / AC-03b — per-scene regeneration is gated only on that scene's linked blocks; blocked per-scene start names the unfinished linked block(s) ✓
- AC-04 — a draft with zero reference blocks generates from prompts + style description alone ✓
- AC-04b — a referenced draft with an unlinked scene is refused (422 `references.unlinked_scenes`), naming the scene(s) ✓
- AC-05 — Reference-boundary invariant: only linked blocks' selected outputs feed a scene ✓
- AC-06 / AC-06b — selection honours the primary star when usable, else falls back to the latest completed output — never an empty reference ✓
- AC-07 — readiness is the persisted output-existence read; scene generation cannot outrun reference generation ✓
- AC-08 — principal image retired: no generation, no approval step, legacy records ignored on read ✓
- AC-09 — non-owners are denied without revealing draft state ✓

## Design

- Spec: `docs/features/scene-generation-reference-gate/spec.md`
- Architecture: `docs/features/scene-generation-reference-gate/sad.md`
- Decisions: `docs/features/scene-generation-reference-gate/adr/` (0001–0004, all Accepted)
- Data model: `docs/features/scene-generation-reference-gate/data-model.md` — **zero live migrations**; the `DROP TABLE storyboard_illustration_references` pair is staged under `migrations/_deferred/`, promoted separately after the KPI window
- API: `docs/features/scene-generation-reference-gate/contracts/openapi.yaml`
- Review: `docs/features/scene-generation-reference-gate/_review/` — 2026-06-10 review (F1–F7) + fix-pass re-review → **PASS**
- Changelog: `docs/features/scene-generation-reference-gate/_changelog/changelog.md`

## Tasks (SDD-Task trailers)

- `918ca86` [T1] readiness reads (Q1–Q3) in the reference repositories
- `02be98f` [T2] ReferenceNotReadyError + UnlinkedScenesError
- `8fdff98` [T3] full-draft Reference-done gate replaces the star gate
- `9bda55e` [T4] per-scene gate scoped to scene-linked blocks
- `b672c8a` [T5] principal image removed from the scene path
- `86cf54a` [T6] principal-image routes deleted + API contract revised
- `63e1c3a` [T7] one selected output per linked block in worker selection
- `e14c0ed` [T8] principal read dropped from scene job inputs
- `855174e` [T9] principal-image step removed from the storyboard SPA
- `082903f` [T10] gate rejection rendered with named blocks and scenes
- `725666b` [T11] endpoint-level gate integration tests on live MySQL
- `3638038` [T12] worker boundary-invariant + selection tests
- `2cd6448` [T13] e2e gate flow + route start through the hook
- `d696dac` [T14] OQ-2/OQ-3 closed, known limitations documented
- `7011760`–`7f3599b` [FX1–FX6] review fix-pass (per-scene 422 surfacing, dead worker path, orphaned schemas, stale copy, gate-message guidance, contract-aligned wording)

## Verification

- Unit + integration (2026-06-10, local): api **1965 ✓** (one pre-existing infra failure in `migration-014.test.ts` cleanup — reproduced identically on `master`, caused by persisted test-DB state, unrelated to this diff), media-worker **267 ✓**, web-editor **3164 ✓**, api-contracts **223 ✓**, project-schema **168 ✓**.
- Typecheck: clean on api / media-worker / api-contracts / project-schema; web-editor has 131 pre-existing errors, **all in untouched legacy test files — 0 in files touched by this feature**.
- Lint: broken repo-wide (ESLint 9 without `eslint.config.js`) — pre-existing, untouched by this PR.
- Ran the feature: e2e `storyboard-reference-gate.spec.ts` **3/3 ✓** through the real rendered UI — AC-02 blocked start naming the block, AC-01 successful start after the reference completes, AC-08 no principal-image step anywhere (provider-stubbed network; the API-level gate is exercised against live MySQL in T11's endpoint tests). Deferred: a full-stack run with real paid generation providers — not exercisable locally by design (no provider calls on the gate path is itself an NFR).

## Operational notes

- Migration: **none on deploy** — behaviour-only (ignore-on-read). Promote `migrations/_deferred/01_drop_storyboard_illustration_references.*` only after `principal-image generations = 0` for 7 days post-rollout.
- Rollback: revert the deploy; no migration to back out. Legacy principal-image rows are untouched.
- Breaking for API consumers: `GET .../illustrations` no longer returns principal fields; the four `.../principal-image/*` routes now 404; `references.star_gate_failed` is retired in favour of `references.reference_gate_failed` / `references.unlinked_scenes`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
