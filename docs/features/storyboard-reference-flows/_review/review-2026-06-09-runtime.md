# Post-ship runtime review — storyboard-reference-flows — 2026-06-09

**Verdict: PASS (feature unaffected) + 1 out-of-scope bug fixed**

Triggered by a production media-worker failure pasted into `/sdd:review`:

```
[media-worker] storyboard-plan job bf4fe7dc-616b-4dae-8c68-726ca1fc8258 failed:
OpenAI storyboard plan failed schema validation:
  musicSegments.1.compositionPlan.sections: composition plan duration must match the covered scene range;
  musicSegments.2.compositionPlan.sections: composition plan duration must match the covered scene range;
  scenes: scene durations must sum to videoLengthSeconds within 0.5 seconds
```

## Scope

- The feature `storyboard-reference-flows` is already shipped & merged (PR #14, `f502de5`); working tree clean — no feature diff to re-review. R1–R3 already PASS (`review-2026-06-07-r3.md`).
- The runtime failure is **out of scope** for this feature: its §5 AC set (AC-01…AC-14b) covers reference blocks / cast / star-gates and never touches `musicSegments`, `compositionPlan`, or scene-duration arithmetic. The failing path is the pre-existing `storyboard-plan` OpenAI generation job.

## Finding (out-of-scope, separate bug)

| # | Finding | Citation | Resolution |
|---|---------|----------|------------|
| RT1 | The system asks the LLM to produce arithmetically-exact durations (scene `durationSeconds` summing to `videoLengthSeconds`; composition `duration_ms` sections summing to the covered scene range), then **hard-fails** any drift > 0.5s. The normalization layer reconciled only the *shape* (key aliases, missing sections) but never the *numbers* the model supplied; `validateStoryboardPlan` classifies the failure as `isDeterministicFailure` → `UnrecoverableError` with **no retry and no repair** (despite `attempts: 3`). A single drifted LLM output fails the whole plan generation for the user. | `packages/project-schema/src/schemas/storyboardPlan.schema.ts:118-141`; `apps/media-worker/src/jobs/storyboardPlan.output.ts:165` (`return explicitDurationMs`); `apps/media-worker/src/jobs/storyboardPlan.job.ts` (`isDeterministicFailure`) | **Fix now** — deterministic reconciliation. |

### Fix (TDD, RED→GREEN)

In `apps/media-worker/src/jobs/storyboardPlan.output.ts`, `normalizeStoryboardPlanCandidate` now reconciles durations before validation:

- `reconcileSceneDurations` rescales scene `durationSeconds` (in integer ms, proportions preserved, residual to the largest scene) so they sum **exactly** to `videoLengthSeconds`. Runs first, so music segments measure their covered range against the same durations the schema checks.
- `reconcileSectionDurationsMs` rescales each composition plan's `duration_ms` sections to sum **exactly** to the covered scene range.
- Both no-op when reconciliation is unsafe (non-numeric / non-positive durations, no usable target), leaving the 0.5s-tolerance validation as a genuine safety net for malformed output rather than a hard gate on normal LLM drift.

RED test reproduced the exact production error (same three messages); GREEN after the fix. Regression: scale=1 where sums already match, so the 4 existing normalization tests are untouched.

## Gate

- New test: `apps/media-worker/src/jobs/storyboardPlan.job.normalization.test.ts` — "reconciles small scene and composition duration drift before validation".
- `vitest run` (media-worker): **259 passed**. `tsc --noEmit`: clean. Lint: pre-existing env breakage (no `eslint.config.js` in package), not introduced here.

**PASS** — storyboard-reference-flows itself remains correct and shipped; the reported runtime failure was a separate robustness gap in the storyboard-plan generation path, now fixed.
