---
name: Generate Wizard Phase 1 + Phase 2 progress
description: State of generate-wizard feature; Phase 1 complete; Phase 2 ALL 7 subtasks complete (2026-04-16)
type: project
---

All subtasks 1–7 complete (2026-04-16). The full generate-wizard Phase 2 bundle is done.

**Established patterns for this feature:**

- All new code under `apps/web-editor/src/features/generate-wizard/`
- Inline style maps in co-located `*.styles.ts` files; no CSS files, no CSS-in-JS
- Design tokens imported from `./mediaGalleryStyles` (already has all §3 tokens)
- React Query for server state; query key prefix `['generate-wizard', ...]`
- `@/` absolute imports for cross-directory; relative (`../types`, `./ComponentName`) inside feature
- `interface` only for `*Props`; `type` for everything else
- `is*` / `has*` boolean naming convention (e.g. `isHovered`, `isLoading`)
- `AssetThumbCard` and `AudioRowCard` are reusable from subtask 1 — import directly, no promotion to packages/ui needed

**Why** `../types` relative import (not `@/features/generate-wizard/types`) is accepted:
WizardStepper.tsx uses it, it was reviewed and approved by code-quality-expert. Established convention in this feature.

**WizardFooter (subtask 5) — DONE:**
- `hasAnyContent(doc)` is exported from `WizardFooter.tsx` to enable isolated unit testing.
- `CancelConfirmDialog` is inlined in `WizardFooter.tsx` (combined file under 300 lines).
- Esc closes the dialog via `document.addEventListener('keydown')` in a `useEffect` (not `onKeyDown` on the element, so it works regardless of focus position).
- `isMountedRef` guards the `navigate('/generate/road-map')` call — prevents setState after unmount when flush resolves.
- Cancel's `deleteDraft` error is intentionally swallowed — user intent is to leave; blocked navigation would be worse than a dangling draft.
- Spinner test: in jsdom, mocked `navigate` does not unmount the component, so `isFlushing` stays `true` after navigate. Test verifies spinner appears + `navigate` is called, not that spinner disappears.

**GenerateWizardPage.tsx — final state:**
- Uses `useGenerationDraft()` hook (replaced `React.useState` for doc)
- `WizardFooter` renders in the footer slot, receiving `{ draftId, doc, flush }`
- `MediaGalleryPanel` receives `onAssetSelected` which calls `promptEditorRef.current?.insertMediaRef`
- Page-level test now wraps in `MemoryRouter` (required for WizardFooter's `useNavigate`)
- Page-level test mocks `useGenerationDraft` to suppress autosave timers

**GenerateWizardPage.test.tsx gotcha:**
When the page renders `WizardFooter` which calls `useNavigate()`, the test needs a `MemoryRouter` wrapper AND a mock for `useGenerationDraft` to avoid real debounce timers. The existing pattern (QueryClientProvider only) broke in subtask 5.

**`MediaRefBlock` schema fields (gotcha):**
The field name is `mediaType` (not `assetType`) and `assetId` (not `id`). Test fixtures for media-ref blocks must use `{ type: 'media-ref', assetId: '...UUID...', mediaType: 'video'|'image'|'audio', label: '...' }`.

**Phase 2 subtask 1 complete (2026-04-16) — ai-enhance queue wiring:**
- `EnhancePromptJobPayload` added to `packages/project-schema/src/types/job-payloads.ts` (alongside existing payload types — no new file needed for a plain type). Must rebuild project-schema (`npm run build`) before downstream `tsc --noEmit` will see new exports.
- `QUEUE_AI_ENHANCE` + `aiEnhanceQueue` in `apps/api/src/queues/bullmq.ts`.
- Producer at `apps/api/src/queues/jobs/enqueue-enhance-prompt.ts`; stub handler at `apps/media-worker/src/jobs/enhancePrompt.job.ts`.
- media-worker `index.ts` now registers `aiEnhanceWorker` (concurrency 2).
- `removeOnComplete: { age: 3600 }, removeOnFail: { age: 86400 }` set in the producer — important for GET polling in subtask 3 to work within 1 hour.

**Phase 2 subtask 2 complete (2026-04-16) — enhancePrompt.job.ts handler:**
- `enhancePrompt.job.ts`: full sentinel-splice implementation; exports `ENHANCE_SYSTEM_PROMPT` (const, tested), `EnhanceTokenPreservationError`, `EnhanceSchemaError`, `EnhancePromptJobDeps`, `processEnhancePromptJob`.
- `enhancePrompt.helpers.ts`: pure functions `serializeWithSentinels`, `validateSentinelIntegrity`, `spliceSentinels`. No I/O.
- Model: `gpt-4o-mini`. Temperature: 0.7. max_tokens: 2048.
- `validateSentinelIntegrity` returns `null` on success, an error string on failure — callers convert non-null to `EnhanceTokenPreservationError`. This avoids throwing inside a pure function.
- `spliceSentinels` omits empty string segments (`parts` from `text.split(...)`) to prevent `{ type: 'text', value: '' }` blocks in the output.
- Test gotcha: `MEDIA_IMAGE` as the ONLY block in a doc → sentinel is `{{MEDIA_1}}`, not `{{MEDIA_2}}`. Sentinels are 1-indexed per document position, not per fixture.
- The EnhanceSchemaError path is nearly unreachable in practice — only if the splice produces a `PromptDoc` that fails Zod, which requires the input media-refs themselves to be malformed. Testing the negative path (schema passes → no error) is the practical approach.

**Phase 2 subtask 3 complete (2026-04-16) — REST endpoints + rate limiter + OpenAPI:**
- `apps/api/src/middleware/enhance.rate-limiter.ts` — `enhancePromptLimiter` keyed on `req.user!.userId` (not IP), 10 req/hr. Must be placed AFTER `authMiddleware` so `req.user` is populated.
- Service additions in `generationDraft.service.ts`: `startEnhance` (resolves ownership, enqueues, returns `{ jobId }`); `getEnhanceStatus` (ownership check, `aiEnhanceQueue.getJob(jobId)`, state mapping). Exported `EnhanceJobStatus` and `EnhanceStatusResult` types.
- Controller additions (thin, 202/200 status codes) + route wiring in `generationDrafts.routes.ts`.
- OpenAPI: added `/generation-drafts/{id}/enhance` (POST) and `/generation-drafts/{id}/enhance/{jobId}` (GET) paths before the existing `/{id}` path block; added `StartEnhanceResponse` and `EnhanceStatusResponse` schemas.
- BullMQ state mapping: `completed` → `done`, `active` → `running`, `failed` → `failed`, everything else (waiting/delayed/unknown) → `queued`.
- Rate-limiter test uses supertest with inline Express app — no real server needed. The default MemoryStore is per-app instance, so per-user key isolation test shares one app instance and switches `currentUserId` via closure.

**Phase 2 subtask 4 complete (2026-04-16) — useEnhancePrompt hook:**
- `types.ts`: added `EnhanceStatus = 'idle'|'queued'|'running'|'done'|'failed'`.
- `api.ts`: added `startEnhance(draftId)` (POST, throws `new Error('rate-limited')` on 429) + `getEnhanceStatus(draftId, jobId)` (GET).
- `hooks/useEnhancePrompt.ts`: hook using `window.setInterval` / `window.clearInterval` (not bare globals — they are unavailable in jsdom cleanup effects). `startedAtRef` tracks elapsed time for the 60 s cap check on each tick.
- `hooks/useEnhancePrompt.test.ts`: 8 tests, all pass. `flushMicrotasks()` helper (5× `await Promise.resolve()`) used to flush nested `.then()` chains; `vi.runAllMicrotasksAsync` (Vitest 2.x only) is NOT available in this project's Vitest 1.6.1.

**Critical jsdom gotcha:** `clearInterval` / `setInterval` as bare globals are NOT defined in React cleanup effects in jsdom. Always use `window.clearInterval` / `window.setInterval` in hooks that are tested with @testing-library/react + jsdom. `clearTimeout` does seem to work bare (used by useGenerationDraft.ts without issue) — so this may be specific to interval vs timeout, or to cleanup vs effect body execution. Safest: use `window.*` prefix for both in new hooks.

**Phase 2 subtask 5 complete (2026-04-16) — EnhancePreviewModal:**
- `renderPromptDocText.ts`: pure helper, text blocks joined as-is, media-ref blocks → `[<mediaType>: <label>]`. No separator between blocks (matches PromptEditor rendering).
- `enhancePreviewModalStyles.ts`: 167 lines; imports tokens from `mediaGalleryStyles.ts` (SURFACE_ELEVATED, BORDER, TEXT_PRIMARY, TEXT_SECONDARY); adds PRIMARY and ERROR_COLOR locally.
- `EnhancePreviewModal.tsx`: uses two-component pattern — outer `EnhancePreviewModal` returns `null` when `open===false` (no hooks), inner `EnhancePreviewModalInner` is only mounted when `open===true` and uses hooks. This avoids the hooks-in-conditional violation.
- Esc handled via `onKeyDown` on `tabIndex=-1` dialog div (not `document.addEventListener`) — this matches `AssetPickerModal` pattern. `WizardFooter.tsx` uses `document.addEventListener` instead — both are valid in different contexts; the `tabIndex=-1` + focus approach requires the dialog to receive focus on mount (done via `useEffect` + `dialogRef.current?.focus()`).
- Discard button label changes to "Close" when `status === 'failed'`.
- `data-testid` attributes: `enhance-backdrop`, `enhance-dialog`, `enhance-close-button`, `enhance-panels`, `enhance-before-text`, `enhance-after-text`, `enhance-error`, `enhance-discard-button`, `enhance-accept-button`.

**Phase 2 subtask 6 complete (2026-04-16) — AI Enhance end-to-end wiring:**
- `PromptToolbar.tsx`: added `draftId`, `isEnhancing`, `onEnhance` props; button disabled when `draftId===null` OR `isEnhancing===true`; `SpinnerIcon` (inline SVG with `style={{ animation: 'spin 0.8s linear infinite' }}` + `<style>` inside SVG) shown during enhancing; `AiEnhanceIcon` shown at rest; `PRIMARY` token (#7C3AED) used for enabled state color. `TEXT_SECONDARY` removed (was unused).
- `GenerateWizardPage.tsx`: `useEnhancePrompt(draftId)` consumed; `isEnhancing = status === 'queued' || status === 'running'`; `handleAccept` calls `setDoc(proposed)` → `flush()` → `reset()` (all synchronous from React's perspective); `EnhancePreviewModal` mounted unconditionally but guarded by `open={status === 'done'}`.
- `PromptToolbar.test.tsx`: `HostWithCapture` updated to accept/forward the 3 new props with safe defaults (`draftId='draft-1'`, `isEnhancing=false`, `onEnhance=vi.fn()`). Existing test 2 updated to pass `draftId: null`. 3 new tests added.
- `GenerateWizardPage.test.tsx`: `vi.hoisted` control surfaces for `useEnhancePrompt` (`mockEnhanceHook`) and `useGenerationDraft` (`mockSetDoc`, `mockFlush`); `EnhancePreviewModal` mocked with `open`-gated stub; `beforeEach` calls `vi.clearAllMocks()` + resets `mockEnhanceHook` to idle default. 3 new tests added. `draftId` in the `useGenerationDraft` mock changed from `null` to `'draft-1'` (AI Enhance button is now active by default — tests that need `null` must pass it explicitly).

**Critical mock pattern for page-level tests when a hook controls status:**
Use `vi.hoisted` + `mockReturnValue` inside each test case, and `vi.clearAllMocks()` + reset in `beforeEach`. This gives per-test isolation without re-declaring the mock.

**Phase 2 subtask 7 complete (2026-04-16) — ProTipCard:**
- `useDismissableFlag.ts`: parameterized by `key`; SSR-safe (`typeof window !== 'undefined'` in both useState initializer and dismiss callback); sentinel `'dismissed'`. `window.localStorage` used (not bare `localStorage`) for consistency with jsdom behavior.
- `proTipCardStyles.ts`: imports shared tokens from `mediaGalleryStyles.ts`; defines `PRIMARY_BORDER = 'rgba(124, 58, 237, 0.3)'`, `RADIUS_MD = '8px'`, `Z_INDEX_PRO_TIP = 100`. Modal z-index is 1000 in `enhancePreviewModalStyles.ts`, so 100 gives clear layering gap.
- `ProTipCard.tsx`: renders `<aside role="note" aria-label="Pro tip">` — semantic `aside` gives screen readers a landmark for supplementary content. Close button `aria-label="Dismiss pro tip"`. Returns `null` when dismissed.
- `GenerateWizardPage.tsx`: `<ProTipCard />` mounted after `</footer>` before `<EnhancePreviewModal>`. Fixed position means DOM order doesn't affect layout; z-index layering is what matters.
- Tests: 4 hook cases + 3 component cases = 7 tests; all use real jsdom `localStorage` (no mocking needed). `window.localStorage.clear()` in `beforeEach`/`afterEach` for isolation.

**AgentTool fallback note:**
The Agent tool for spawning reviewer subagents has been unavailable in sessions for this task. If it remains unavailable, fall back to direct review per task-executor skill fallback instructions.
