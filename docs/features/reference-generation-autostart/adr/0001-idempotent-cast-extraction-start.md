---
status: Accepted
owner: "Oleksii (Storyboard squad)"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-11"
feature_size: "S"
ticket: "reference-generation-autostart"
---

# 0001 — Make cast-extraction start idempotent per draft (return the existing job)

- **Status:** Accepted
- **Date:** 2026-06-11
- **Deciders:** Oleksii (Storyboard squad), Tech Lead

## Context

Auto-start fires the free cast extraction on every Step-2 entry for a draft that has none yet. Because entry is "each open/re-mount/re-focus" (spec §1¶4) and React 18 StrictMode double-invokes mount effects, several start requests can arrive nearly simultaneously for the same draft. The server's `startExtraction` (`apps/api/src/services/storyboardReference.extraction.service.ts`) today guards only against already-confirmed reference *blocks* (`CastAlreadyExtractedError`, AC-01b) — it does **not** check for an existing queued/running/completed extraction *job*, so concurrent starts create duplicate job rows. The spec keys dedup on the draft's **persisted** extraction state and requires zero second extractions per draft.

## Decision drivers

- **Duplicate-extraction rate target = 0** per draft from repeated Step-2 entries (spec §6 NFR).
- **Dedup must key on persisted state, not a session flag** (spec §1¶4) — i.e. the authority is the stored job, not client memory.
- **One-cast-extraction-per-draft** domain invariant (spec AC-05).
- A frontend-only guard cannot cover multi-tab / multi-device concurrency; the invariant must hold where the data lives.
- **No change to proposal logic** (spec §3 non-goal) — the guard is purely a pre-insert existence check.

## Considered options

1. **Frontend guard only** — an in-flight ref/promise guard plus the existing client-side existence check, no backend change.
2. **Backend idempotency only** — `startExtraction` returns the existing in-flight/completed job; no client guard.
3. **Backend idempotency + frontend guard (defense in depth)** — server is the source of truth for the invariant; the client guard suppresses the redundant POST in the common single-client re-mount case.

## Decision outcome

**Chosen:** Option 3. `startExtraction` becomes idempotent per draft — before creating a job it looks up the latest non-terminal-or-completed extraction for the draft and, if one exists, returns it (same `{ jobId, status }` shape) instead of inserting a second row. The frontend `useCastAutostart` hook keeps an in-flight guard so a re-mounting client does not fire the redundant request. The server guarantees the invariant under any concurrency (including multiple tabs); the client guard keeps traffic clean and latency low. The `CastAlreadyExtractedError` blocks-guard is unchanged and still wins when confirmed blocks already exist.

## Consequences

**Positive**
- The "0 duplicate extractions" NFR holds under all concurrency, not just single-client — the invariant is enforced at the datastore boundary.
- The manual control and auto-start converge on the same returned job naturally (both call the now-idempotent start).
- Small, additive change — no proposal-logic or schema change; existing `findLatestCastExtractionJobForDraft` repository method is reused.

**Negative**
- Expands the feature's surface from frontend-only to also touch one backend service method (and its tests); the SAD's §2 "no backend change" assumption is overridden accordingly.
- "Return existing" must define which statuses count as existing (queued/running/completed = existing; `failed` = not existing, a new start is allowed) — a small semantic the contract/tests must pin (carried into the `api` stage and AC-07).
- The response type widens: `StartExtractionResult.status` changes from the literal `'queued'` to the `queued | running | completed` union so an already-running/completed job can be returned. No field is added, but this is a (small) typed-contract change the `api` stage must reflect.

**Neutral**
- The frontend guard becomes a latency/traffic optimization rather than a correctness mechanism; it could be dropped later with no invariant impact.

## Links

- Spec: [[../spec.md]] (§6 NFR duplicate-extraction; §1¶4; AC-05; AC-07)
- SAD: [[../sad.md]] §4 (choice 3) · §8 (dedup) · §11 (residual-race risk closed)
- Related ADR: none
