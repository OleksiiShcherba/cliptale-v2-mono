---
feature: scene-generation-reference-gate
date: "2026-06-10"
kind: re-review (fix-pass)
reviewer: "Independent clean-context review (sdd:reviewer) — Tech Lead gate"
verdict: PASS
---

# Re-review — scene-generation-reference-gate (fix-pass, 2026-06-10)

Follow-up to [`review-2026-06-10.md`](./review-2026-06-10.md) (CHANGES REQUESTED, 7 findings F1–F7 all "Fix now").

## Scope

- Diff: `git diff d696dac..HEAD` — the fix-pass only.
- **21 files changed, 208 insertions(+), 306 deletions(-)** (6 fix commits `7011760..e8a6117` + this re-review's F8 fix `7f3599b`).
- Surfaces touched: web-frontend (F1, F5, F6), worker + project-schema (F2), api-contracts (F3), api-service + validation (F4, F7, F8).
- Fix-pass SDD-AC trailers: AC-03b (F1), AC-08 (F2, F3, F4, F6), AC-02 (F7), AC-04b (F8).

One clean-context reviewer verified each prior finding is genuinely closed end-to-end and swept for regressions on the previously-clean ACs.

## Verification of prior findings

| # | Prior severity | Verdict | Evidence (post-fix) |
|---|---|---|---|
| F1 | BLOCKER (AC-03b) | **CLOSED** | `useStoryboardIllustrations.ts:227,235-242` — `retryBlock` clears gate state on entry and sets `gateError` from `err.code/details`, mirroring `start()`. Real hook test drives `startStoryboardBlockIllustration`→422 and asserts scene-scoped `gateError.details.blocks` (`useStoryboardIllustrations.gate422.test.ts`), not a prop tautology; non-gate path + clear-on-success covered. |
| F2 | MAJOR | **CLOSED, no regression** | `style_reference` branches + `StoryboardReferenceRepo` wiring gone (`storyboardOpenAIImage.job.ts:305-309,319`, `workerRepositories.ts`); `StoryboardOpenAIImageJobKind` narrowed to `'scene'`. Only producers emit `kind:'scene'`; worker tsc clean. |
| F3 | MINOR | **CLOSED** | 3 principal body schemas removed from `openapi.ts`; test asserts absence. |
| F4 | MINOR | **CLOSED, no regression** | 3 validation exports + now-unused imports deleted; remaining `buildReferencePrompt` in `storyboardReference.confirm.service.ts:156` is a distinct local function, not a broken import. |
| F5 | MINOR | **CLOSED** | Idle copy → "Scene images start automatically once references are ready."; no "principal image" in production copy. |
| F6 | MINOR | **CLOSED, no regression** | `'reference'` phase removed from union + all usages (copy branch, dead Retry button, `onStart`/`isBlocking` props); no orphaned caller; scene-failure retry intact. |
| F7 | MINOR (AC-02) | **CLOSED** | Both gate scopes (`service.ts:54-55, 91-93`) match openapi `reference_gate_failed` examples with correct grammar. |

## New finding (re-review) & verdict

| # | Severity | File:line | Finding | Verdict |
|---|---|---|---|---|
| F8 | MINOR (AC-04b) | `apps/api/src/services/storyboardIllustration.service.ts:70-71` | The `unlinked_scenes` rejection string diverged from the openapi `unlinkedScenes` example (same class as F7, AC-04b branch). Code + `details.scenes` were already correct; only the human string differed. | **Fix now** → fixed in `7f3599b`: now "… has no linked reference: …. Link a reference before starting." with singular/plural grammar; `starGate.service.test.ts` asserts the guidance. |

## Regression sweep

The fix-pass touched no AC-01/AC-04/AC-05/AC-06/AC-06b/AC-07/AC-09 behaviour. Gate/worker/contract/schema/frontend suites all green: api 1965✓, media-worker 267✓, web-editor 3164✓, contracts 223✓, project-schema 168✓, e2e gate-spec 3/3✓; tsc clean across touched packages.

## Verdict

**PASS** — all 7 first-round findings genuinely closed, the one re-review finding (F8) fixed in-pass, no regression. Ready to ship.

Next: `/clear`, then `/sdd:ship scene-generation-reference-gate`.
