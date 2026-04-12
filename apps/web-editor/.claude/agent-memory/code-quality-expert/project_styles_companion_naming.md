---
name: Styles companion file naming is NOT a §9 violation
description: .styles.ts is an established and valid pattern used across 9 files in the codebase
type: project
---

The `.styles.ts` suffix is a **valid and established pattern** in the codebase. While §9 does not explicitly list it, it is used across 9 files:
- src/App.styles.ts
- src/topBar.styles.ts
- src/features/export/components/ExportModal.styles.ts
- src/features/export/components/rendersQueueModal.styles.ts
- src/features/asset-manager/components/replaceAssetDialog.styles.ts
- src/features/asset-manager/components/deleteAssetDialog.styles.ts
- src/features/asset-manager/components/assetPreviewModal.styles.ts
- src/features/asset-manager/components/assetDetailPanel.styles.ts
- src/features/timeline/components/deleteTrackDialog.styles.ts

**Why:** The pattern follows the spirit of §9 by using camelCase prefix + descriptive suffix. It is not a violation of the rules — it is a project convention.

**How to apply:** Do NOT flag `.styles.ts` files as naming violations. This was a false positive in B7 round 2 code review. Correct it if encountered in future reviews. The pattern is established and approved by the user.

**Status:** Ruling finalized 2026-04-12 in B7 round 3 review.
