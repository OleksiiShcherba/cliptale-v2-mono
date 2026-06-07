## Summary

Replaces the storyboard's single principal-image approval with **per-character and per-environment reference flows** the Creator curates before any expensive scene generation. Cast extraction proposes the cast from the script + uploaded images; one collective confirmation creates a reference block per entry (1:1 with an auto-created, editable flow that auto-starts in a rolling window); the Creator stars the best results; scene generation is gated until every block has ≥1 star, then picks references per scene within the reference boundary. Spec: `docs/features/storyboard-reference-flows/spec.md`.

## Acceptance criteria

- AC-01 / AC-01b — cast extracted & proposed from script + uploaded images; repeat run is idempotent ✓
- AC-02 — cast size limit enforced; overflow surfaced as `truncated` end-to-end ✓
- AC-03 / AC-04 — confirm auto-creates blocks + auto-starts flows under one collective confirmation; partial failure → per-block failed status + retry, others unaffected ✓
- AC-05 — open linked flow from block and return ✓
- AC-06 / AC-07 — star/unstar; primary star = block preview, with fallback when primary/all stars removed ✓
- AC-08 / AC-08b — star gate blocks scene generation until every block has ≥1 star; gate scope is per-scene (only linked blocks) ✓
- AC-09 — scene generation stays within the reference boundary ✓
- AC-10 / AC-10b — scene linking; out-of-draft scene → 422; reorder changes no links ✓
- AC-11 — manual block add, bounded by per-user creation rate limit (429) ✓
- AC-12 — flow list reflects block↔flow links ✓
- AC-13 — non-owner access hidden (404, not 409/403) ✓
- AC-14 / AC-14b — block deletion; draft (soft) deletion clears the badge ✓

## Design

- Spec: `docs/features/storyboard-reference-flows/spec.md`
- Architecture: `docs/features/storyboard-reference-flows/sad.md`
- Decisions: `docs/features/storyboard-reference-flows/adr/` (ADR-0001…0011)
- Data model + migrations: `docs/features/storyboard-reference-flows/data-model.md` (migrations `052`–`056`)
- API: `docs/features/storyboard-reference-flows/contracts/openapi.yaml`
- Changelog: `docs/features/storyboard-reference-flows/_changelog/changelog.md`

## Tasks (SDD-Task trailers)

Implemented across tasks T2, T5–T8, T10–T15, T17, T21 (cross-layer e2e), followed by review-fix passes:
- F1–F14 (review round 1): enrichment on `GET blocks`, rolling-window claim→running, worker repo wiring, overflow `truncated` carrier, scene-link 422, soft-delete badge filter, **SEVERE** cross-tenant file-in-flow guard on stars + real wired-service tests, reorder/rate-limit tests, deleteFlow existence hiding, imageFileIds ownership check, hard-assert e2e, inline-hex extraction.
- R1–R5 (rounds 2–3): route `cast-extract` jobs to `processCastExtractJob` (queue branch on `job.name`), reconcile `windowStatus`/rate-limit code with runtime + contract, e2e + retryBlock docstrings.

## Verification

- Unit + integration (feature surface):
  - `apps/media-worker`: **258/258 pass**
  - `apps/web-editor`: **3146/3146 pass**
  - `apps/api`: **1912 pass** (4 skipped, 2 todo). One unrelated suite fails — `src/__tests__/integration/migration-014.test.ts` (`ER_FK_CANNOT_DROP_PARENT` via `fk_storyboard_scene_illustration_ai_job`, which originates in migration **038** on `master`, not this feature). Pre-existing DB-state/test-isolation flake, not attributable to any feature commit.
- Lint + typecheck: pre-existing repo-wide breakage (not introduced by this feature); quality covered in review stage 2.
- Ran the feature: **deferred** — the end-to-end flow requires full infra (MySQL + Redis + S3 + OpenAI + media-worker) not available in this environment, and e2e targets a deployed host with a seeded user under a 15-min login rate limit. What was verified instead: the gate above + three independent clean-context reviews (rounds 1–3) tracing every AC end-to-end on the **production** path with non-mocked-repo tests (`_review/review-2026-06-07-r3.md` — **PASS**).

## Operational notes

- Migrations `052`–`056`: applied on deploy, each reverts cleanly via paired `.down.sql`; already promoted into `apps/api/src/db/migrations/`. Rollback = revert `056→052` + revert deploy.
- Feature flag / config: none.
- Existing principal-image drafts are untouched (no backfill); they switch to the new mechanism only when reference generation is next run.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
