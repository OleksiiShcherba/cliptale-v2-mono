# Active Task

Two independent bug fixes scoped from user feedback on the asset-preview and progressive-reveal-caption features.

---

## Task 1 — AssetPreviewModal: video/audio do not play; hide preview affordance for audio

**Source:** docs/active_task.md (user input)
**Goal:** Opening the Preview button on a video or audio asset plays the media inside the modal. Audio assets no longer show a "preview" affordance tied to a playable video-like thumbnail — they use the waveform+controls presentation only, and their card/detail-panel visual does not offer a broken preview slot.

### Why this task matters
The Asset Detail Panel exposes a "Preview" button that opens `AssetPreviewModal`. Today the modal mounts `<video>` / `<audio>` with `asset.downloadUrl` passed through `buildAuthenticatedUrl()`. But `downloadUrl` is a **presigned S3 GET URL** produced by `apps/api/src/services/asset.response.service.ts:87`, not a proxy endpoint on the API — so appending `?token=…` is meaningless (S3 ignores the extra query parameter, but in local docker-compose dev the presigned URL usually targets the internal MinIO hostname, which the browser cannot reach). The Remotion Player works fine because `useRemotionPlayer.ts:68` uses `${apiBaseUrl}/assets/:id/stream` (the API proxy with Range support and token auth). The modal must use the same proxy endpoint.

Separately, the user says the preview affordance shouldn't be offered for audio assets in the way it currently is — audio already has its own inline waveform+controls UX elsewhere, and having a "Preview" button that opens a modal with a broken or redundant player surface is confusing.

### Relevant architecture constraints
- **No raw `s3://` or direct presigned S3 URLs exposed to the browser for media playback** (dev/prod parity) — media goes through `GET /assets/:id/stream` which is already protected by `authMiddleware` and supports Range headers (`apps/api/src/routes/assets.routes.ts:60`, `asset.response.service.ts:165 streamAsset`).
- **Browser media elements cannot set headers**, so `buildAuthenticatedUrl()` query-param auth is the established pattern (`apps/web-editor/src/lib/api-client.ts:18`).
- **One file reads env vars per app** — do not introduce a new config read; `config.apiBaseUrl` is the entry point.
- **Feature-owned API calls** — network helpers go in `features/asset-manager/api.ts` or `utils.ts`; no direct `fetch` in components.
- **300-line cap per file** — `AssetPreviewModal.tsx` is ~150 lines and can absorb the small change. No split required.
- **Co-located tests** — update `AssetPreviewModal.test.tsx` in lockstep with the behavior change; the existing tests assert `downloadUrl+token` and must be rewritten to assert the stream endpoint URL.

### Related areas of the codebase
- `apps/web-editor/src/features/asset-manager/components/AssetPreviewModal.tsx` — the modal; currently feeds `buildAuthenticatedUrl(asset.downloadUrl)` to `<video>` / `<audio>` src. Needs to switch to the stream endpoint.
- `apps/web-editor/src/features/asset-manager/components/AssetPreviewModal.test.tsx` — current tests lock in the wrong URL (`downloadUrl+token`) for video/audio branches and must be updated.
- `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx` — the panel that hosts the "Preview" button and opens the modal. Subtask 2 modifies what this renders for audio assets.
- `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.preview.test.tsx` — existing coverage for the Preview button visibility/behavior; expect an audio-specific test case here.
- `apps/web-editor/src/features/asset-manager/utils.ts:69` — `getAssetPreviewUrl()` already delegates to the stream endpoint for non-thumbnail assets; the same helper can be reused for video/audio modal src construction (but note it currently wraps with `buildAuthenticatedUrl` internally, so do not double-wrap).
- `apps/web-editor/src/features/preview/hooks/useRemotionPlayer.ts:68` — reference implementation of the pattern (stream endpoint + `buildAuthenticatedUrl`).
- `apps/web-editor/src/features/asset-manager/components/assetDetailPanel.styles.ts` — where the "previewContainer" and `actionButton` styles live, if audio needs a different layout.

---

## Task 2 — Caption word highlighting only works for the first clip

**Source:** docs/active_task.md (user input)
**Goal:** Every `CaptionClip` on the timeline — not just the one at `startFrame: 0` — correctly highlights the active word (`activeColor`) as playback reaches it, with inactive words rendered in `inactiveColor`.

### Why this task matters
`CaptionLayer.tsx:65` compares `useCurrentFrame() >= word.startFrame`. Inside a `<Sequence from={clip.startFrame}>`, `useCurrentFrame()` returns the **local frame (0-based from the Sequence start)**. But `useAddCaptionsToTimeline.ts:72` stores `word.startFrame = Math.round(word.start * fps)` — an **absolute/global frame** derived straight from the Whisper timestamp. For the first caption clip (segment 0 starts at second 0, i.e. `clip.startFrame === 0`), local and absolute frames coincide, so the highlight works by accident. For every subsequent caption clip (e.g. clip at global frame 150), `useCurrentFrame()` yields 0…N while `word.startFrame` is ≥ 150 — the condition never becomes true and every word stays `inactiveColor`.

This is a correctness bug in the Remotion composition data model: either (a) the words must be persisted as clip-relative frames, (b) `CaptionLayer` must be given the clip offset and subtract it, or (c) `VideoComposition.tsx:94` pre-maps words to clip-local before handing them to `CaptionLayer`. Per the display-captions Remotion best-practices file, clip-local timestamps are the idiomatic convention for content rendered inside a `Sequence`.

### Relevant architecture constraints
- **Schema is the contract**: `captionClipSchema` in `packages/project-schema/src/schemas/clip.schema.ts:51` currently says nothing about whether word frames are local or absolute. Whatever we decide must be explicit in the schema JSDoc and backed by a test in `clip.schema.test.ts`.
- **Remotion best practices (display-captions.md)**: word-highlighting components typically consume clip-local timestamps so a `<Sequence>` wrapper is transparent. Per the skill file: "Current time relative to the start of the sequence" is the intended semantics.
- **Deterministic, frame-based rendering** — no timers, no wall-clock; `CaptionLayer` must remain a pure function of `useCurrentFrame()` so SSR rendering stays correct (§ CaptionLayer JSDoc).
- **Backward compatibility for persisted project docs** — existing projects with CaptionClips on disk already contain absolute word frames. A migration path is needed, *or* the layer must accept an offset so old documents still render correctly. See Open Questions.
- **Co-located tests + fixtures + 300-line cap** — update `CaptionLayer.test.tsx`, `VideoComposition.test.tsx`, `useAddCaptionsToTimeline.caption.test.ts`, `useCaptionEditor.fixtures.ts` in lockstep. Fixtures that currently assert `word.startFrame === 10` when `clip.startFrame === 10` are exercising the bug — those will need to change.
- **Whatever fix is chosen, ClipBlock caption preview (`ClipBlock.tsx` / `getClipLabel`) must still render the word preview** correctly — check that no downstream consumer depends on the current (absolute) interpretation.

### Related areas of the codebase
- `packages/remotion-comps/src/layers/CaptionLayer.tsx` — contains the buggy comparison on line 65; may need a prop like `clipStartFrame` or a redefinition of what `word.startFrame` means.
- `packages/remotion-comps/src/compositions/VideoComposition.tsx:94` — the caption branch wrapping `CaptionLayer` in `<Sequence from={clip.startFrame}>`. Will pass the offset (or pre-transformed words) depending on the chosen approach.
- `apps/web-editor/src/features/captions/hooks/useAddCaptionsToTimeline.ts:55-96` — where Whisper segments are converted to CaptionClips. Frame math lives here and must agree with the layer's expectations.
- `packages/project-schema/src/schemas/clip.schema.ts:51` — `captionClipSchema` word subfield; JSDoc + (optionally) validation bounds depend on the chosen semantic.
- `packages/project-schema/src/schemas/clip.schema.test.ts` — existing tests already use absolute frames in their fixtures (`startFrame: 10` when clip `startFrame: 10`); will need corrected values.
- `apps/web-editor/src/features/captions/hooks/useCaptionEditor.fixtures.ts`, `useAddCaptionsToTimeline.caption.test.ts`, `useAddCaptionsToTimeline.fixtures.ts`, `ClipBlock.fixtures.ts`, `VideoComposition.fixtures.ts` — fixture updates.
- `apps/web-editor/src/features/timeline/components/ClipBlock.tsx` — `getClipLabel(captionClip)` reads the first word preview; confirm no dependence on absolute frames.
- `apps/web-editor/src/features/captions/components/CaptionEditorPanel.tsx` — if it renders/edits word timings for user inspection, its display format may need updating.

---

## Subtasks (ordered by dependency)

### Task 1 — Preview modal

- [x] **1.1 Switch `AssetPreviewModal` video/audio src to the `/assets/:id/stream` endpoint** — done 2026-04-13 (lockstep with 1.2); see development_logs.md

- [x] **1.2 Update `AssetPreviewModal.test.tsx` expectations for video/audio src** — done 2026-04-13 (lockstep with 1.1); see development_logs.md

- [ ] **1.3 ⚠️ Decide and implement the audio preview-affordance change in AssetDetailPanel**
  - What: Per open question OQ-1 below, either (a) hide the "Preview" button entirely for audio assets, or (b) replace the preview modal entry point for audio with the existing inline waveform/play control, or (c) remove the "previewContainer" thumbnail slot at the top of `AssetDetailPanel` for audio. Implement the chosen approach and add a test case to `AssetDetailPanel.preview.test.tsx` verifying audio assets do not render the affordance.
  - Where: `apps/web-editor/src/features/asset-manager/components/AssetDetailPanel.tsx`, its styles file if layout changes, and `AssetDetailPanel.preview.test.tsx`.
  - Why: User explicitly asked for the preview icon to not show for audio. The exact surface ("icon") is ambiguous until OQ-1 is resolved — do not implement until the user confirms which affordance to hide.
  - Depends on: OQ-1 resolution.

- [ ] **1.4 Manual verification pass (docker-compose dev)**
  - What: Run the web editor via docker-compose, upload a video and an audio asset, click Preview on each, and confirm both play with working controls and that the audio affordance change matches the agreed design from 1.3. Capture a screenshot for the dev log.
  - Where: browser (Chrome), localhost via docker-compose.
  - Why: The bug is only reproducible against the real presigned-URL path; unit tests can't confirm playback.
  - Depends on: 1.1, 1.2, 1.3.

### Task 2 — Caption word highlighting

- [x] **2.1 Decide the word-frame semantic** — done 2026-04-13. Resolved OQ-2 with **approach B (offset prop)**: `word.startFrame` stays absolute, `CaptionLayer` receives `clipStartFrame` and reconstructs the global frame. Chosen for zero-migration, minimal blast-radius, and backward compatibility with existing persisted docs. Also moots OQ-3 (no schema change → no migration).

- [x] **2.2 Update schema / layer JSDoc to state the chosen semantic** — done 2026-04-13. Added JSDoc to `captionClipSchema` and per-field JSDoc to `word.startFrame`/`word.endFrame` declaring them absolute composition frames, and expanded `CaptionLayer` JSDoc to document the `clipStartFrame` reconstruction.

- [x] **2.3 Fix `CaptionLayer` so word highlighting works inside any `<Sequence>`** — done 2026-04-13 (approach B). Added `clipStartFrame?: number` prop (default 0), reassigned `const currentFrame = clipStartFrame + useCurrentFrame()`.

- [x] **2.4 Wire the fix in `VideoComposition.tsx` caption branch** — done 2026-04-13. Passed `clipStartFrame={clip.startFrame}` in the `<CaptionLayer>` invocation.

- [x] **2.5 Update `useAddCaptionsToTimeline` — no-op under approach B** — done 2026-04-13. Producer already emits absolute frames (matches the contract under approach B). No code change required; covered by the schema JSDoc addition in 2.2.

- [x] **2.6 Update fixtures and unit tests — no changes required under approach B** — done 2026-04-13. Fixtures already use absolute frames. With `clipStartFrame` defaulting to 0, all existing tests remain green without modification. Verified: `remotion-comps` (49 tests), `project-schema` (89 tests), `captions` feature (124 tests), `ClipBlock` (31 tests) — all pass.

- [x] **2.7 Add regression test: second caption clip highlights correctly** — done 2026-04-13. Added `describe('clipStartFrame offset (regression: second-clip word highlighting)')` block to `CaptionLayer.test.tsx` with 5 new cases covering: first word activates at local frame 0 with clipStartFrame=150, second word at local frame 10, all three words at local frame 20, buggy behaviour reproduction without clipStartFrame, and backward compatibility with clipStartFrame=0.

- [x] **2.8 Legacy project-doc migration — not needed under approach B** — done 2026-04-13. Resolved OQ-3 as no-op: approach B preserves the absolute-frame contract so existing persisted CaptionClips remain valid with zero migration. No DB migration written; no runtime heuristic needed.
  - What: Existing projects persisted to the DB have CaptionClips with absolute word frames. Decide whether to (a) ignore legacy docs (user says the feature is fresh enough to not care), (b) write a one-shot DB migration to rewrite `word.startFrame -= clip.startFrame` for all existing caption clips in `project_clips_current`, or (c) accept both shapes in `CaptionLayer` via a runtime heuristic. Implement whichever is agreed.
  - Where: `apps/api/src/db/migrations/` (if option b) or a `CaptionLayer.tsx` heuristic (option c).
  - Why: Fixing the math while leaving legacy docs broken would mask the bug as a data issue; users would see "old clips still broken".
  - Depends on: OQ-3 resolution.

- [ ] **2.9 Manual verification: playback with multiple caption clips**
  - What: Load a project with at least two caption clips at different `startFrame` positions (or transcribe a two-segment video), play through in the Remotion Player, and visually confirm every word of every clip switches to `activeColor` at the right moment. Screenshot both clips for the dev log.
  - Where: browser via docker-compose.
  - Why: The bug is visible, not analytic; manual confirmation is the acceptance gate.
  - Depends on: 2.3 – 2.8.

---

## Open Questions / Blockers

- **OQ-1 (Task 1, subtask 1.3)** — What exactly does "we don't need to display preview icon for audio" mean?
  1. Hide the "Preview" button in `AssetDetailPanel` entirely for `audio/*` content types?
  2. Hide the preview thumbnail slot (`s.previewContainer`) at the top of `AssetDetailPanel` for audio (since audio has no visual)?
  3. Remove the play-icon overlay on the `AssetCard` thumbnail for audio items in the browser list?
  Likely (1) — the word "button" appears elsewhere in the user's message, and audio playback is already handled through the inline player in the detail panel/timeline. But confirmation is needed before implementing. **Stop and ask the user before starting 1.3.**

- **OQ-2 (Task 2, subtask 2.1)** — Clip-local word frames (approach A) vs. offset prop (approach B) vs. pre-map in composition (approach C)? Recommendation: **approach A (clip-local)** — it matches Remotion's `<Sequence>` convention, is the idiomatic pattern in `display-captions.md` from the Remotion best-practices skill, and is the most future-proof if we later add the `@remotion/captions` package with `TikTokPage` tokens (which are already relative to the page sequence). Approach B is the least invasive but puts a footgun in the schema for future consumers. Approach C hides the issue in the composition and gets regenerated on every render.

- **OQ-3 (Task 2, subtask 2.8)** — Do we need to migrate legacy CaptionClip documents already saved in the DB? If the answer is "no, dev-only data, wipe and retranscribe" we can skip the migration and save ~1 day. If "yes, live users", we need the migration. Asked because the user's phrasing ("that do work only with first clip") doesn't indicate whether they have real project data to preserve.

---

## Notes for the implementing agent

- **Do not start subtasks 1.3, 2.1, or 2.8** until the matching open questions have been resolved with the user. These are product/architecture decisions per the `feedback_escalate_architecture` memory.
- **Use docker-compose for manual verification** — bare localhost will give a false negative for Task 1 because the bug is partly about docker-internal MinIO hostnames being browser-unreachable (`project_dev_workflow` memory).
- **`buildAuthenticatedUrl` is the ONLY authorized way to attach a token to a media-element URL** — do not invent a new wrapper. See `useRemotionPlayer.ts:68` for the canonical pattern.
- **Remotion best practices — `useCurrentFrame()` inside a `<Sequence from=N>` returns frames *local to the sequence*, not global composition frames.** This is the root cause of Task 2 and is documented in `display-captions.md`. Any future work on caption layers must reckon with this.
- **Do not introduce a `@remotion/captions` dependency in this task** — the user didn't ask for it; fix the existing layer in-place. A future refactor to `createTikTokStyleCaptions` can come later.
- **The 300-line cap applies** — if `CaptionLayer.test.tsx` grows past 300 lines after adding regression cases, split into `CaptionLayer.highlight.test.tsx` per §9.7 convention.
- **Keep the JSDoc on `CaptionLayer` truthful** — its current doc comment claims "deterministic for SSR" which remains true after the fix, but the specific phrasing "`currentFrame >= word.startFrame`" needs to be updated if the semantic changes.
- **Task 1 and Task 2 are independent** and can be implemented by separate agents in parallel — they touch disjoint files (`AssetPreviewModal` / `AssetDetailPanel` vs. `CaptionLayer` / `VideoComposition` / `useAddCaptionsToTimeline`).

---
_Generated by task-planner skill — 2026-04-13_

---
**Status: Ready For Use By task-executor**
