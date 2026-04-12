---
name: Asset Preview Modal design pattern
description: AssetPreviewModal follows ExportModal/DeleteAssetDialog inline modal pattern with design-guide tokens
type: project
---

## Modal Pattern Established

**AssetPreviewModal (Task A1, subtask A1)** follows the same inline modal scaffolding as `ExportModal` and `DeleteAssetDialog`:

- **Overlay**: fixed position, flex center, dark backdrop (rgba(0,0,0,0.75)), blur optional (glassmorphism hint per design-guide §9)
- **Modal container**: SURFACE_ELEVATED background, BORDER outline (1px), radius-lg (16px), flexbox column, overflow hidden
- **Header**: 48px height (vs ExportModal 44px — intentional variation for A1), SURFACE_ALT background, flex space-between, BORDER bottom
- **Body**: flex 1, padding space-6 (24px), auto overflow, gap space-3 (12px), SURFACE_ELEVATED background
- **Typography**: title uses heading-3 (16px/600/24px); other text should use body/body-sm/caption from design-guide §3
- **Close button**: transparent bg, TEXT_SECONDARY color, uses unitless lineHeight (should be fixed per design-guide)

## Design Guide Alignment Notes

- All colors use design-guide tokens ✓
- All spacing on 4px grid ✓
- All radii use design-guide tokens (4px, 8px, 16px) ✓
- Typography mostly correct but some instances (13px text, missing line-heights) need fixes

## Review Round 1 Findings (2026-04-11)

Flagged 3 issues in assetPreviewModal.styles.ts:
1. Line 144: fontSize 13 (not a token) → should be 14px body or 12px body-sm + full token spec
2. Line 134: fontSize 12 missing fontWeight/lineHeight → add body-sm or label full token
3. Line 72: lineHeight 1 (unitless) → change to 'normal' or specific px value per Inter grid

All marked as COMMENTED pending developer fixes.
