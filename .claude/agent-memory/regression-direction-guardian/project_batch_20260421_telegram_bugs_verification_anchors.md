---
name: 2026-04-21 Telegram-bugs batch verification anchors
description: Anchors for the fix/telegram-bugs-timeline-preview-storyboard batch (3 subtasks) — what's load-bearing and what's a latent no-op
type: project
---

Three subtasks shipped on `fix/telegram-bugs-timeline-preview-storyboard` (uncommitted working tree, base `origin/master@005d9a3`):

- **Subtask 1 — project store reset.** `apps/web-editor/src/store/project-store.ts` `resetProjectStore(projectId)` + `apps/web-editor/src/store/history-store.ts` `resetHistoryStore()`. Both called at top of `useProjectInit` hydration effect BEFORE `fetchLatestVersion` (verified `apps/web-editor/src/features/project/hooks/useProjectInit.ts:115-116`). `_resetForTesting()` kept as thin alias for BC. 23 unit tests pass (12 + 7 + 4).
- **Subtask 2 — auth-aware home thumbnails.** `ProjectCard.tsx` + `StoryboardCard.MediaThumb` wrap `thumbnailUrl` with `buildAuthenticatedUrl` (appends `?token=` from localStorage). ProjectCard works — server builds proxy URL at `projects.controller.ts:41-44`. **StoryboardCard is a latent no-op**: `generationDraft.service.ts:286` sets `thumbnailUrl: asset.thumbnailUri`, and `findAssetPreviewsByIds` always returns `thumbnailUri: null` (enforced by its own test at `generationDraft.repository.test.ts:148-153`). 28 tests pass but the fix is dormant on storyboard surface.
- **Subtask 3 — `compact?: boolean` on AssetDetailPanel.** `assetDetailPanel.styles.ts` becomes `getAssetDetailPanelStyles(compact)` factory (mirrors EPIC F `getPanelStyle` precedent). `compact = true` preserves 280×620 fixed; `compact = false` → `width: 100%` / `maxWidth: 520` / `minHeight: 620`. WizardAssetDetailSlot passes `compact={false}`. `generateWizardPage.styles.ts` `rightColumn.padding: '0' → '24px'`. 78 tests pass (21 + 11 + 8 + 20 + 18).

**Why:** Subtask 1 reinforces the typed-document + snapshot-per-update core-architecture promise (patches from prior project bleeding into new project's first version was directly violating it). Subtask 3 is the second instance of the `getPanelStyle(compact)` factory pattern — now a canon.

**How to apply:** Future Guardian reviews of the storyboard surface should verify whether the `findAssetPreviewsByIds` SELECT has been widened to include `thumbnail_uri` before celebrating thumbnail visibility. Until then, the auth-wrap is cosmetic for `StoryboardCard.MediaThumb`.

Regression numbers at time of review (2026-04-21):
- Full web-editor sweep: 200 files / 2245 tests PASS.
- apps/api sweep: 111 pass / 3 FAIL / 5 skipped / 2 todo. Failing trio unchanged from Known Issues: `versions-list-restore-endpoint.test.ts` (Class A DEV_AUTH_BYPASS), `assets-finalize-endpoint.test.ts` + `assets-list-endpoint.test.ts` (Class C dropped `project_assets_current`). `renders-endpoint.test.ts` continues to pass (previously Class A).
