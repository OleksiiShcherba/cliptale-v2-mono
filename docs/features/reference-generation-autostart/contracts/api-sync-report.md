# API sync report — reference-generation-autostart

**Stage:** `api` · **Generated:** 2026-06-11 · **Contract:** `contracts/openapi.yaml` (OpenAPI 3.1, v1.1.0)
**Interface kind:** HTTP/REST · **Surface (sad.md):** `[web-frontend, backend-service]` → backend-service authors; web-frontend consumes.

## Inputs read

| Input | Found | Use |
|---|---|---|
| `data-model.md` | ✓ | `storyboard_cast_extraction_jobs` columns; `schema_delta: none`; status ENUM authority |
| `sad.md` §6 | ✓ | Flow 1 (first-entry start), Flow 2 (re-entry/concurrent — idempotent), Flow 5 (manual recovery); ADR-0001 |
| `spec.md` §4/§5 | ✓ | US-01/US-05/US-06; AC-01/AC-05/AC-07; §6 NFR "0 duplicate extractions" |
| `adr/0001-*.md` | ✓ (Accepted) | the one decision — idempotent start; `status` literal → union consequence |
| live code (`Explore`) | ✓ | route paths, controller shapes, `StartExtractionResult`, error codes — to derive against reality not guesswork |

## Scope decision — why this is a DELTA contract (not a fresh surface)

sad.md §2 fixes it: this feature **reuses the existing reference endpoints, signatures unchanged**. The web-frontend surface *consumes* the backend contract (it authors nothing — surfaces.md rule). The backend-service surface changes **exactly one** operation. So the contract is the delta:

| Endpoint | This feature | Where the contract lives |
|---|---|---|
| `POST /storyboards/{draftId}/references/extract` | **CHANGED** — idempotent per draft (ADR-0001); `status` union widened | **here** (`openapi.yaml`) |
| `GET /storyboards/{draftId}/references/extraction` | reused verbatim | `../../storyboard-reference-flows/contracts/openapi.yaml` (`getCastExtraction` / `CastExtractionJob`) |
| `POST /storyboards/{draftId}/references/confirm` | reused verbatim | same predecessor contract (`confirmCast`) |
| event `storyboard.cast_extraction.updated` | reused verbatim (no new event, payload unchanged — spec §3 non-goal) | `../../storyboard-reference-flows/contracts/events.md` |

**No `events.md` is emitted for this feature** — the only async flow (extraction progress) is inherited unchanged; duplicating it would be a stale fork. The §6 "async dead-letter is feature-level, not queue-level" flag confirms no new worker flow.

## The one delta (ADR-0001 §Consequences)

`ExtractionStartResult` (domain `StartExtractionResult`, `storyboardReference.extraction.service.ts`):

```
WAS:  status: enum [queued]                       (only a freshly-created job was ever returned)
NOW:  status: enum [queued, running, completed]   (idempotent guard may return an existing job)
```

Additive, backward-compatible widening (every old value still valid) → `info.version` 1.0.0 → 1.1.0. No field added. `failed` is deliberately **excluded** from the union: a `failed` latest is treated as not-existing, so the service issues a fresh start and returns `queued` (CONTEXT glossary "Idempotent start"; data-model.md §Entities status row).

> **Schema rename note.** The predecessor contract named this shape `ExtractionAccepted` with `enum:[queued]`. This feature's contract uses `ExtractionStartResult` (matches the domain type `StartExtractionResult` 1:1). When `implement` promotes the change, the live response type widens; the predecessor `ExtractionAccepted` schema is the thing being superseded — flagged for the reconcile/implement step, not silently divergent.

## Field origins (operation.field → origin → confidence)

| Path | Origin | Confidence |
|---|---|---|
| `extract POST` (path/method) | spec §4 US-01/US-05; sad §6 Flow 1/2/5; live route `storyboard-references.routes.ts:36` | High |
| `extract.param Idempotency-Key` | reused repo precedent (controller requires it today); sad §8 idempotency row | High |
| `extract.param draftId` | `generation_drafts.id`; owner-scope `resolveDraftOwner` (spec §6.1) | High |
| `ExtractionStartResult.jobId` | `storyboard_cast_extraction_jobs.id` (data-model.md) | High |
| `ExtractionStartResult.status` | `storyboard_cast_extraction_jobs.status` ENUM (data-model.md); union per ADR-0001 | High |
| `202.examples.returnedExisting*` | sad §6 Flow 2/5 ("returns the existing job — no second row"); AC-05 | High |
| `409 references.cast_already_confirmed` | live error `CastAlreadyExtractedError` (statusCode 409); unchanged guard; spec OQ-3 default | High |
| `Error{code,details}` envelope | reused from predecessor contract; live controller error shape | High |

No invented field — every field traces to a `data-model.md` column or the reused predecessor schema.

## Drift checklist — FORWARD (contract derived correctly)

| # | Check | Verdict |
|---|---|---|
| F1 | endpoint ↔ model: `extract` writes/reads `storyboard_cast_extraction_jobs` (existing table, `schema_delta: none`) | ✓ |
| F2 | validation ↔ constraint: `status` enum = the table's ENUM minus `failed` (intentional, per ADR-0001) | ✓ |
| F3 | error-code ↔ repo: `references.cast_already_confirmed` exists (`CastAlreadyExtractedError`, 409) | ✓ |
| F4 | OpenAPI ↔ sequence: 202 + idempotent-existing body matches sad §6 Flow 2/5 (`returns the existing job`) | ✓ |
| F5 | async/idempotency: `Idempotency-Key` required (mutating + async actor); per-draft dedup documented as distinct from header dedup | ✓ |

## Drift checklist — BACK-FEED (coverage cross-check)

| AC / flow | Covered by | Verdict |
|---|---|---|
| AC-01 (happy auto-start) | `extract` 202 `createdNew` example | ✓ |
| AC-05 (one-extraction invariant) | `extract` 202 `returnedExistingRunning/Completed` (no second row) | ✓ |
| AC-07 (manual recovery after failed auto-start) | `extract` — `failed` latest → fresh start, `queued` returned; same endpoint, manual caller | ✓ |
| AC-02 / AC-03 / AC-06 (modal states) | **frontend-only** (CastConfirmModal render) — no backend operation; reads reused `GET …/extraction` | ✓ (no contract surface) |
| AC-04 (consent before charge) | reused `POST …/confirm` (unchanged) | ✓ (predecessor contract) |
| sad §6 Flow 1/2/5 `alt` branches | each maps to a 202 example or the 409 guard | ✓ |

**Sequence gaps:** none. Every error/authz branch the contract needs has a §6 flow (Flow 2/5 cover the idempotent-existing branch; the 409 blocks-guard is the unchanged AC-01b/OQ-3 authority). No `Fix-the-source-first` needed.

**Operations with no user story / AC:** none — the single operation maps to US-01/US-05/US-06.

## Decisions recorded (resolved, non-blocking)

1. **Idempotent "return existing" stays `202` (not `200`).** The operation's contract is "ensure an extraction is underway"; both create-new and return-existing are *accepted* outcomes and carry the same body. This matches the live controller (returns 202 today) and ADR-0001's "same `{ jobId, status }` shape." A `200`-for-existing split would force the consuming `useCastAutostart` to branch on status code for no behavioural gain. Low blast radius; revisit only if a consumer needs to distinguish created-vs-reused (it does not — AC-05 is transparent).
2. **`failed` excluded from `ExtractionStartResult.status`.** Per ADR-0001 + glossary, a `failed` latest is not-existing → fresh start → `queued`. Returning `failed` here would contradict the idempotency semantics.
3. **No new `events.md`.** Async event reused unchanged; pointer to predecessor contract instead of a duplicate.

## Definition of Done

- [x] `contracts/openapi.yaml` written — OpenAPI 3.1, `BearerAuth` global, `{error,code,details}` envelope, operation carries request/success/error examples (placeholder UUIDs only), shared types `$ref`’d.
- [x] `api-sync-report.md` written — field-origins table + forward & back-feed drift checklists, every core check ✓.
- [x] Every endpoint maps to a §4 user story; every field traces to a `data-model.md` column or a reused predecessor schema; every error `code` exists in the repo.
- [x] No `events.md` — feature has no *new* async flow (reused verbatim).
- [ ] `spectral lint` — **not wired in this repo** (no spectral dep / config found); YAML validated structurally via `js-yaml` (paths + schemas + status enum confirmed). Suggest adding spectral to the api check target when the toolchain allows.
