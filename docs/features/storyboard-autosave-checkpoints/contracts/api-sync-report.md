# api-sync-report — storyboard-autosave-checkpoints

> Generated 2026-06-05 alongside `openapi.yaml`. Inputs read: `data-model.md` (2026-06-05),
> `sad.md` §5/§6/§8 (frontmatter `target_surfaces: [web-frontend, backend-service]` — read, not
> re-derived; backend-service authors this HTTP contract, web-frontend consumes it), `spec.md`
> §4/§5/§6/§6.1, ADR-0002/0003/0004/0005. **Found:** sad.md ✓, spec.md ✓ — no derivation gaps.
> Async: none (§6 notes: all flows synchronous, no `<message-bus>`) → **no events.md**.

## Brownfield deviations from SDD defaults

All inherited from the repo / the generate-ai-flow contract precedent (team decision 2026-06-03):

| Default | Deviation | Justification |
|---|---|---|
| Error envelope `{code, message, details?}` | `{error}` + optional additive `{code, details}` | repo's central errorHandler (`apps/api/src/index.ts`) emits `{error}`; codes exist only for GateError/RateLimited |
| Cursor pagination on lists | `GET …/history` returns a bare array, newest-first, hard cap 50 | endpoint pre-exists this feature with this shape; HISTORY_CAP=50 makes pagination moot |
| `/api/v1` URL prefix | rooted paths | repo mounts all routes at `/` |
| snake_case wire keys | camelCase | repo wire convention |
| Idempotency-Key on retried mutations | none | the only retry loop (AC-01b) targets PUT full-replace — naturally idempotent; checkpoint single-flight is client-side (AC-07b, ADR-0002) |

## Section A — field-origins table

| schema_path | origin | confidence |
|---|---|---|
| putStoryboard.{blocks,edges,musicBlocks} | repo `storyboard.controller.schemas.ts` (existing endpoint, unchanged — `# existing-unchanged`) | high |
| putStoryboard.response (StoryboardState) | repo `storyboardService.saveStoryboard` return (existing, unchanged) | high |
| pushCheckpoint.snapshot | data-model.md → `storyboard_history.snapshot` (JSON NOT NULL; inline data-URL per ADR-0005) | high |
| pushCheckpoint.previewKind | data-model.md → `storyboard_history.preview_kind` ENUM('screenshot','minimap') | high |
| pushCheckpoint → server-side `origin='checkpoint'` | data-model.md → `storyboard_history.origin` ENUM (ADR-0003); not a request field — clients cannot write `legacy` | high |
| pushCheckpoint.response.id | data-model.md → `storyboard_history.id` BIGINT UNSIGNED AUTO_INCREMENT | high |
| listCheckpointHistory.items[].id | data-model.md → `storyboard_history.id` (`ORDER BY id DESC` = newest first) | high |
| listCheckpointHistory.items[].draftId | data-model.md → `storyboard_history.draft_id` CHAR(36) | high |
| listCheckpointHistory.items[].snapshot | data-model.md → `storyboard_history.snapshot` | high |
| listCheckpointHistory.items[].previewKind | data-model.md → `storyboard_history.preview_kind` (non-null on the wire: list is pre-filtered to checkpoint rows, which always carry it) | high |
| listCheckpointHistory.items[].createdAt | data-model.md → `storyboard_history.created_at` TIMESTAMP | high |
| getMySettings/putMySettings.autosaveIntervalSeconds | data-model.md → `user_settings.settings_json.autosaveIntervalSeconds`; enum 30/60/120/300/600 = Zod whitelist (ADR-0004) | high |
| getMySettings/putMySettings.updatedAt | data-model.md → `user_settings.updated_at` DATETIME(3); `null` = lazy row absent (AC-11b defaults) | high |

No `low`-confidence rows — every non-`# existing-unchanged` field maps to a `data-model.md` column.

## Section B — drift findings (4-point checklist)

1. **Endpoint ↔ data-model** *(core)* — ✓
   `PUT /storyboards/{draftId}` → existing draft-state tables (lightweight tier; writes no history — AC-02 invariant). `GET/POST /storyboards/{draftId}/history` → `storyboard_history` (+origin filter / +origin stamp + prune cap 50). `GET/PUT /users/me/settings` → `user_settings` (lazy upsert). No endpoint without an entity; no new entity without an endpoint.

2. **Error code ↔ repo error definition** *(core)* — ✓
   Repo form detected: typed error classes in `apps/api/src/lib/errors.ts` → central `errorHandler` → `{error}` JSON (machine `code` only on GateError/RateLimited). This feature introduces **no new machine codes** — all responses map to existing classes: 400 ValidationError (Zod whitelist), 401 UnauthorizedError, 403 ForbiddenError (ownership AC-13 / ACL), 404 NotFoundError, 413 (express.json limit, unchanged per spec §6.1), 500 fallback. Contract `Error.code` kept optional for envelope compatibility.

3. **Validation ↔ constraint** *(core)* — ✓
   `AutosaveIntervalSeconds` enum [30,60,120,300,600] = data-model's Zod whitelist verbatim (ADR-0004; DB deliberately untyped — repo norm). `PreviewKind` enum [screenshot,minimap] = `preview_kind` ENUM verbatim. `snapshot` opaque `object` = JSON NOT NULL (repo treats it as `unknown`). `draftId` uuid = CHAR(36) UUID v4. `maxItems: 50` on the history list = HISTORY_CAP (owner-confirmed 2026-06-05). No spec↔model constraint conflicts.

4. **OpenAPI ↔ sequence** *(supporting)* — ✓ with 2 notes (not gaps):
   - Every §6 `alt`/`else` branch has a response: ownership denial (US-05/AC-13, US flows' «перевіряє власника») → 403/404; lightweight-save failure (AC-01b) → 5xx + client retry; settings write/read failure (AC-11/AC-11b) → 5xx; capture failure (AC-04) is **client-side** — it reaches the contract as `previewKind: minimap`, not as an error response.
   - **Note 1 (AC-11c mapping):** the settings sequence's «чужий акаунт» else-branch maps to *structural* enforcement — `/users/me/settings` carries no userId param, another account is not addressable; the only contract-visible denial is 401. Stronger than a 403 check; recorded as the intended design, not a sequence gap.
   - **Note 2 (client-only ACs):** AC-03b (deferral), AC-05 (idle/no request), AC-06 (countdown), AC-07b (double-save guard) have no contract surface by design (ADR-0002 client scheduler). The server intentionally has no checkpoint concurrency lock.

### Back-feed coverage cross-check (spec §5 ↔ contract)

| AC | Contract surface |
|---|---|
| AC-01 / AC-01b / AC-02 | `putStoryboard` 200 / 5xx + retry note / invariant in description (no history write) |
| AC-03 / AC-03c / AC-07 / AC-12 | `pushCheckpoint` 201 (trigger timing — interval / overdue / manual / pre-restore — is client-side; the push is identical) |
| AC-03b / AC-05 / AC-06 / AC-07b | client-only (ADR-0002) — no contract surface, by design |
| AC-04 | `pushCheckpoint` with `previewKind: minimap` 201 |
| AC-08 | `listCheckpointHistory` 200 (origin filter, newest first, ≤ 50) |
| AC-09 / AC-11 | `putMySettings` 200 / 400 whitelist / 5xx kept-previous-value note |
| AC-10 / AC-11b | `getMySettings` 200 (stored / defaults-with-null-updatedAt) / 5xx session-default note |
| AC-11c | structural me-scoping + 401 (Note 1) |
| AC-13 | 403 on all `/storyboards/{draftId}*` operations |

Every §4 user story maps to ≥1 operation (US-01→putStoryboard; US-02/04/07→pushCheckpoint;
US-03→client-only countdown over getMySettings cadence; US-05→listCheckpointHistory;
US-06→settings pair). Every operation maps back to ≥1 story + AC. No orphan sequences, no
unused model fields (`origin` is consumed server-side: stamp on insert + list filter +
fallback-share analytics).

**Result: 4/4 ✓, 0 core findings, 2 informational notes — no pause required.**

## Follow-ups

- `spectral lint contracts/openapi.yaml` — spectral is not wired into the repo's check targets.
  Attempted 2026-06-05 (`npx @stoplight/spectral-cli` 6.x + `spectral:oas` ruleset): crashes with
  `Cannot read properties of null (reading 'enum')` on BOTH this contract and the already-accepted
  generate-ai-flow contract — a Spectral bug triggered by `null` values inside `example` blocks,
  not a defect in either file. YAML parse verified clean (`yaml-lint` ✔). Re-try when spectral
  fixes the JSONPath-on-null crash, or wire a repo `.spectral.yaml` that disables `typed-enum`.
- Reconcile triggers: none pending — data-model.md is final (TBD: «Немає», 2026-06-05).
