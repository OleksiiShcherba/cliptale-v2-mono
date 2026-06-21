---
name: reference-confirm-proposal-fallback
description: Subtask 2 (2026-06-21): legacy /references/confirm path now falls back to proposal scene_block_ids when client omits them; buildProposalSceneIdMap + filterValidSceneIds + INSERT IGNORE
metadata:
  type: project
---

Subtask 2 of "Fix storyboard reference auto-linking" completed 2026-06-21.

**What changed in `storyboardReference.confirm.service.ts`:**
- Added `buildProposalSceneIdMap(draftId, userId)` — reads the latest completed cast-extraction proposal via `findLatestCastExtractionJobForDraft`, builds a `castType:name → sceneBlockIds[]` map; ambiguous duplicate keys are removed entirely (skip rather than mislink).
- Modified `confirmCast`: before the transaction, builds the proposal map. In the block loop, if `entry.sceneBlockIds` is empty/absent, looks up `castType:name` in the map. Resolved IDs are pre-filtered through `filterValidSceneIds` (from `storyboardPipeline.repository.ts`) then inserted with `INSERT IGNORE`.
- The `ConfirmedBlock.sceneBlockIds` returned now reflects the final resolved+filtered set.

**Why:** The legacy path was the likely root cause of zero link rows for draft `c25b3544…` — the FE sent cast entries without sceneBlockIds, so zero links were created.

**How to apply:** Any future changes to how scene links are created in the legacy service should also handle the `filterValidSceneIds` pre-filter + `INSERT IGNORE` pattern to stay FK-safe.

**Key imports used (no new SQL added to service):**
- `findLatestCastExtractionJobForDraft` from `@/repositories/storyboardReference.repository.js`
- `filterValidSceneIds` from `@/repositories/storyboardPipeline.repository.js`
